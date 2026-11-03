import crypto from 'crypto';
import { GoogleGenAI } from '@google/genai';
import { ProductSKU, Location, Batch, PickOrder, StockMovement, AuditLogEntry } from '../src/types/wms';
import { calculateOptimizedPickRoute } from '../src/utils/routeOptimizer';

export interface AgentContext {
  skus: ProductSKU[];
  locations: Location[];
  batches: Batch[];
  orders: PickOrder[];
  stockMovements: StockMovement[];
  auditLogs: AuditLogEntry[];
  allowNegativeStock: boolean;
  configuredSqlServer: { host: string; port: number | string; database: string } | null;
  sqlConnectionError: string | null;
  getGenAIClient: () => GoogleGenAI | null;
  nowStamp: () => string;
  uid: () => string;
}

export interface AgentToolDeclaration {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, {
      type: string;
      description: string;
      enum?: string[];
      items?: { type: string };
    }>;
    required?: string[];
  };
}

const isDateStr = (d: unknown): d is string =>
  typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && !isNaN(new Date(d).getTime());

/** Batch numbers are only unique per product, so the product is used whenever it is given. */
function findBatch(batches: Batch[], batchNo: string, sku?: unknown): { batch?: Batch; error?: string } {
  const wanted = batchNo.toLowerCase();
  const wantedSku = sku ? String(sku).toLowerCase() : '';
  const matches = batches.filter((b) => b.batchNo.toLowerCase() === wanted && (!wantedSku || b.sku.toLowerCase() === wantedSku));
  if (matches.length === 0) return { error: `Batch '${batchNo}'${wantedSku ? ` for SKU '${sku}'` : ''} not found` };
  if (matches.length > 1) {
    return { error: `Batch number '${batchNo}' exists for more than one product (${matches.map((b) => b.sku).join(', ')}). Include "sku".` };
  }
  return { batch: matches[0] };
}

export const AGENT_TOOLS: AgentToolDeclaration[] = [
  {
    name: 'get_warehouse_status',
    description: 'Get real-time operational status of ApexWMS including SKU counts, total stock on hand, critical expiry counts, and database status.',
    parameters: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'search_inventory',
    description: 'Search warehouse inventory items (SKUs) by keyword, barcode, category, or zone.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search term for SKU, product name, barcode or category' },
        limit: { type: 'number', description: 'Maximum number of items to return (default: 25)' }
      },
      required: ['query']
    }
  },
  {
    name: 'get_sku_details',
    description: 'Retrieve detailed information for a specific SKU including all batches, expiry dates, locations, and total on-hand vs reserved quantities.',
    parameters: {
      type: 'object',
      properties: {
        sku: { type: 'string', description: 'Product SKU code (e.g. PAR-500, AMOX-250)' }
      },
      required: ['sku']
    }
  },
  {
    name: 'get_expiring_batches',
    description: 'Retrieve batches nearing expiry to enforce First-Expired, First-Out (FEFO) compliance and identify potential stock loss.',
    parameters: {
      type: 'object',
      properties: {
        withinDays: { type: 'number', description: 'Threshold in days (e.g. 30, 60, 90). Defaults to 30 days.' },
        limit: { type: 'number', description: 'Maximum number of batches to return (default: 50)' }
      }
    }
  },
  {
    name: 'get_quarantined_batches',
    description: 'Retrieve all batches currently under quarantine hold, damaged, or pending QA inspection.',
    parameters: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'quarantine_batch',
    description: 'Place a batch into quarantine or release it back to active inventory status.',
    parameters: {
      type: 'object',
      properties: {
        batchNo: { type: 'string', description: 'The batch number to quarantine or release' },
        sku: { type: 'string', description: 'Product SKU (needed when the batch number exists for more than one product)' },
        quarantined: { type: 'boolean', description: 'True to quarantine, False to release to ACTIVE' },
        reason: { type: 'string', description: 'Reason for quarantine action or inspection result' }
      },
      required: ['batchNo', 'quarantined']
    }
  },
  {
    name: 'get_locations',
    description: 'Query warehouse storage locations (aisle, rack, shelf, zone) with current weight utilization and stored items.',
    parameters: {
      type: 'object',
      properties: {
        zone: { type: 'string', description: 'Filter by storage zone (e.g. Ambient, Cold Storage, Quarantine)' },
        aisle: { type: 'string', description: 'Filter by aisle identifier (e.g. A, B, C)' }
      }
    }
  },
  {
    name: 'list_orders',
    description: 'List sales and pick orders in the warehouse filtered by status or priority.',
    parameters: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          description: 'Filter by status',
          enum: ['PENDING', 'PICKING', 'COMPLETED', 'CANCELLED', 'ALL']
        },
        limit: { type: 'number', description: 'Maximum number of orders to return (default: 20)' }
      }
    }
  },
  {
    name: 'get_order_details',
    description: 'Retrieve full order details including line items, allocated batches, picked quantities, and delivery date.',
    parameters: {
      type: 'object',
      properties: {
        orderId: { type: 'string', description: 'Sales/Pick Order ID or Order Number (e.g. ORD-1001)' }
      },
      required: ['orderId']
    }
  },
  {
    name: 'receive_stock',
    description: 'Receive new inbound stock into the warehouse, creating a new lot/batch in the designated location.',
    parameters: {
      type: 'object',
      properties: {
        sku: { type: 'string', description: 'Product SKU code' },
        batchNo: { type: 'string', description: 'Manufacturer batch or lot number' },
        quantity: { type: 'number', description: 'Quantity in cartons / units received' },
        locationId: { type: 'string', description: 'Destination location ID (e.g. A-01-01)' },
        bestBeforeDate: { type: 'string', description: 'Best before / expiry date (YYYY-MM-DD)' },
        manufactureDate: { type: 'string', description: 'Manufacture date (YYYY-MM-DD)' },
        supplier: { type: 'string', description: 'Supplier name or vendor code' },
        unitCost: { type: 'number', description: 'Unit cost per item/carton' }
      },
      required: ['sku', 'batchNo', 'quantity', 'locationId', 'bestBeforeDate']
    }
  },
  {
    name: 'adjust_stock',
    description: 'Perform a cycle count stock adjustment for a specific batch, logging the discrepancy reason.',
    parameters: {
      type: 'object',
      properties: {
        batchNo: { type: 'string', description: 'Batch number to adjust' },
        sku: { type: 'string', description: 'Product SKU (needed when the batch number exists for more than one product)' },
        newQuantity: { type: 'number', description: 'New verified quantity on hand' },
        reason: { type: 'string', description: 'Audit reason for the adjustment (e.g. Physical cycle count variance, damaged carton)' },
        operator: { type: 'string', description: 'Name or ID of agent/operator performing adjustment' }
      },
      required: ['batchNo', 'newQuantity', 'reason']
    }
  },
  {
    name: 'move_stock',
    description: 'Transfer a batch from its current location to a new target location.',
    parameters: {
      type: 'object',
      properties: {
        batchNo: { type: 'string', description: 'Batch number to relocate' },
        sku: { type: 'string', description: 'Product SKU (needed when the batch number exists for more than one product)' },
        toLocationId: { type: 'string', description: 'Target destination location ID (e.g. B-02-03)' },
        quantity: { type: 'number', description: 'Optional. Whole batches only: if given it must equal the batch quantity on hand' },
        operator: { type: 'string', description: 'Operator or AI Agent executing the transfer' }
      },
      required: ['batchNo', 'toLocationId']
    }
  },
  {
    name: 'optimize_pick_route',
    description: 'Calculate the shortest, most efficient pick traversal sequence through warehouse aisles for an order or list of locations.',
    parameters: {
      type: 'object',
      properties: {
        orderId: { type: 'string', description: 'Order ID to generate an optimized pick path for' },
        locationIds: { type: 'string', description: 'Comma-separated list of location IDs to optimize' }
      }
    }
  },
  {
    name: 'execute_sql_query',
    description: 'Read-only table listing. NOT a real SQL engine: the query text is only used to pick one of Skus, Batches, Locations, SalesOrders or StockMovements, and the first 50 rows are returned (WHERE / JOIN are ignored). Prefer the specific tools such as search_inventory.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'T-SQL SELECT statement' }
      },
      required: ['query']
    }
  }
];

export async function executeAgentTool(
  toolName: string,
  params: Record<string, any>,
  ctx: AgentContext
): Promise<{ success: boolean; data?: any; error?: string }> {
  const {
    skus,
    locations,
    batches,
    orders,
    stockMovements,
    auditLogs,
    nowStamp,
    uid
  } = ctx;

  switch (toolName) {
    case 'get_warehouse_status': {
      const now = Date.now();
      const expiringSoon = batches.filter((b) => {
        const days = Math.ceil((new Date(b.bestBeforeDate).getTime() - now) / (1000 * 3600 * 24));
        return days <= 30 && b.status === 'ACTIVE';
      });
      const quarantined = batches.filter((b) => b.status === 'QUARANTINED');
      const totalUnits = batches.reduce((sum, b) => sum + (b.quantityOnHand || 0), 0);
      const pendingOrders = orders.filter((o) => o.status === 'PENDING' || o.status === 'IN_PROGRESS' || o.status === 'OPTIMIZED');

      return {
        success: true,
        data: {
          timestamp: nowStamp(),
          system: 'ApexWMS Enterprise Service',
          databaseEngine: ctx.configuredSqlServer ? 'MS SQL Server (Live / Hybrid Store)' : 'In-Memory Store',
          totalSkus: skus.length,
          totalBatches: batches.length,
          totalQuantityOnHand: totalUnits,
          batchesExpiring30Days: expiringSoon.length,
          quarantinedBatches: quarantined.length,
          openOrders: pendingOrders.length,
          allowNegativeStock: ctx.allowNegativeStock
        }
      };
    }

    case 'search_inventory': {
      const q = String(params.query || '').trim().toLowerCase();
      const limit = Math.min(Number(params.limit) || 25, 100);
      if (!q) return { success: false, error: 'Query parameter is required' };

      const matchedSkus = skus.filter((s) =>
        s.sku.toLowerCase().includes(q) ||
        s.name.toLowerCase().includes(q) ||
        (s.barcode && s.barcode.toLowerCase().includes(q)) ||
        (s.category && s.category.toLowerCase().includes(q))
      ).slice(0, limit);

      const result = matchedSkus.map((s) => {
        const itemBatches = batches.filter((b) => b.sku === s.sku);
        const activeBatches = itemBatches.filter((b) => b.status === 'ACTIVE');
        const onHand = activeBatches.reduce((sum, b) => sum + b.quantityOnHand, 0);
        const quarantined = itemBatches.filter((b) => b.status === 'QUARANTINED').reduce((sum, b) => sum + b.quantityOnHand, 0);
        return {
          sku: s.sku,
          name: s.name,
          category: s.category,
          unit: s.unit,
          barcode: s.barcode,
          reorderPoint: s.reorderPoint,
          safetyStock: s.safetyStock,
          totalQuantityOnHand: onHand,
          quarantinedQuantity: quarantined,
          activeBatchesCount: activeBatches.length,
          storageZone: s.storageZone,
          lowStock: onHand <= s.reorderPoint
        };
      });

      return {
        success: true,
        data: {
          query: q,
          totalMatches: result.length,
          items: result
        }
      };
    }

    case 'get_sku_details': {
      const skuCode = String(params.sku || '').trim();
      const sku = skus.find((s) => s.sku.toLowerCase() === skuCode.toLowerCase());
      if (!sku) return { success: false, error: `SKU '${skuCode}' not found in catalog` };

      const itemBatches = batches.filter((b) => b.sku.toLowerCase() === sku.sku.toLowerCase());
      const now = Date.now();

      const batchList = itemBatches.map((b) => {
        const days = Math.ceil((new Date(b.bestBeforeDate).getTime() - now) / (1000 * 3600 * 24));
        const loc = locations.find((l) => l.id === b.locationId);
        return {
          batchNo: b.batchNo,
          quantityOnHand: b.quantityOnHand,
          status: b.status,
          locationId: b.locationId,
          locationName: loc ? `Aisle ${loc.aisle}, Rack ${loc.rack}-${loc.shelf} (${loc.zone})` : b.locationId,
          bestBeforeDate: b.bestBeforeDate,
          daysUntilExpiry: days,
          supplier: b.supplier,
          manufactureDate: b.manufactureDate
        };
      });

      const totalOnHand = itemBatches.filter((b) => b.status === 'ACTIVE').reduce((sum, b) => sum + b.quantityOnHand, 0);

      return {
        success: true,
        data: {
          sku: sku.sku,
          name: sku.name,
          category: sku.category,
          unit: sku.unit,
          reorderPoint: sku.reorderPoint,
          safetyStock: sku.safetyStock,
          weightPerUnitKg: sku.weightPerUnitKg,
          totalQuantityOnHand: totalOnHand,
          isLowStock: totalOnHand <= sku.reorderPoint,
          batches: batchList
        }
      };
    }

    case 'get_expiring_batches': {
      const daysThreshold = Number(params.withinDays) || 30;
      const limit = Math.min(Number(params.limit) || 50, 200);
      const now = Date.now();

      const expiring = batches
        .filter((b) => b.status === 'ACTIVE' && b.quantityOnHand > 0)
        .map((b) => {
          const days = Math.ceil((new Date(b.bestBeforeDate).getTime() - now) / (1000 * 3600 * 24));
          const loc = locations.find((l) => l.id === b.locationId);
          return {
            batchNo: b.batchNo,
            sku: b.sku,
            itemName: b.itemName,
            quantityOnHand: b.quantityOnHand,
            bestBeforeDate: b.bestBeforeDate,
            daysUntilExpiry: days,
            locationId: b.locationId,
            locationZone: loc?.zone || 'General',
            fefoPriority: days <= 0 ? 'EXPIRED' : days <= 14 ? 'CRITICAL' : days <= 30 ? 'HIGH' : 'NORMAL'
          };
        })
        .filter((b) => b.daysUntilExpiry <= daysThreshold)
        .sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry)
        .slice(0, limit);

      return {
        success: true,
        data: {
          thresholdDays: daysThreshold,
          count: expiring.length,
          batches: expiring
        }
      };
    }

    case 'get_quarantined_batches': {
      const quarantined = batches
        .filter((b) => b.status === 'QUARANTINED')
        .map((b) => ({
          batchNo: b.batchNo,
          sku: b.sku,
          itemName: b.itemName,
          quantityOnHand: b.quantityOnHand,
          locationId: b.locationId,
          quarantineReason: b.notes || 'Under QA hold',
          receivedAt: b.receivedAt,
          supplier: b.supplier
        }));

      return {
        success: true,
        data: {
          count: quarantined.length,
          batches: quarantined
        }
      };
    }

    case 'quarantine_batch': {
      const batchNo = String(params.batchNo || '').trim();
      const quarantined = Boolean(params.quarantined);
      const reason = String(params.reason || (quarantined ? 'Quarantined via AI Agent API' : 'Released via AI Agent API'));

      const found = findBatch(batches, batchNo, params.sku);
      if (!found.batch) return { success: false, error: found.error };
      const batch = found.batch;
      if (batch.status === 'RECALLED' || batch.status === 'EXPIRED') {
        return { success: false, error: `Batch ${batch.batchNo} is ${batch.status} and cannot be held or released here.` };
      }

      const oldStatus = batch.status;
      batch.status = quarantined ? 'QUARANTINED' : 'ACTIVE';
      if (params.reason) batch.notes = `${quarantined ? 'Quarantine Notice' : 'Release Note'}: ${reason}`;

      auditLogs.unshift({
        id: `AUD-${uid()}`,
        timestamp: nowStamp(),
        userId: 'USR-AI-AGENT',
        userName: 'Apex AI Agent',
        userRole: 'Admin',
        actionCategory: 'QUARANTINE',
        actionType: quarantined ? 'BATCH_QUARANTINED' : 'BATCH_RELEASED',
        targetEntity: `Batch ${batch.batchNo} (${batch.sku})`,
        details: `AI Agent changed status from ${oldStatus} to ${batch.status}. Reason: ${reason}`,
        severity: quarantined ? 'WARNING' : 'INFO'
      });

      return {
        success: true,
        data: {
          batchNo: batch.batchNo,
          sku: batch.sku,
          previousStatus: oldStatus,
          newStatus: batch.status,
          quarantineReason: batch.notes
        }
      };
    }

    case 'get_locations': {
      let filtered = [...locations];
      if (params.zone) {
        const z = String(params.zone).toLowerCase();
        filtered = filtered.filter((l) => l.zone.toLowerCase().includes(z));
      }
      if (params.aisle) {
        const a = String(params.aisle).toUpperCase();
        filtered = filtered.filter((l) => l.aisle.toUpperCase() === a);
      }

      const res = filtered.map((l) => {
        const storedBatches = batches.filter((b) => b.locationId === l.id && b.quantityOnHand > 0);
        return {
          locationId: l.id,
          aisle: l.aisle,
          rack: l.rack,
          shelf: l.shelf,
          zone: l.zone,
          capacityKg: l.capacityKg,
          currentKg: l.currentKg,
          utilizationPercent: l.capacityKg > 0 ? Math.round((l.currentKg / l.capacityKg) * 100) : 0,
          storedBatchesCount: storedBatches.length,
          batches: storedBatches.map((b) => ({ batchNo: b.batchNo, sku: b.sku, qty: b.quantityOnHand }))
        };
      });

      return {
        success: true,
        data: {
          totalLocations: res.length,
          locations: res
        }
      };
    }

    case 'list_orders': {
      const status = String(params.status || 'ALL').toUpperCase();
      const limit = Math.min(Number(params.limit) || 25, 100);

      let list = orders;
      if (status !== 'ALL') {
        list = orders.filter((o) => o.status.toUpperCase() === status);
      }

      const mapped = list.slice(0, limit).map((o) => ({
        id: o.id,
        salesOrderNo: o.salesOrderNo || o.id,
        customerName: o.customerName,
        orderDate: o.orderDate,
        requiredDeliveryDate: o.requiredDeliveryDate,
        status: o.status,
        priority: o.priority,
        destinationZone: o.destinationZone,
        totalOrderCtn: o.totalOrderCtn,
        totalFulfilledCtn: o.totalFulfilledCtn,
        totalOutstandingCtn: o.totalOutstandingCtn,
        itemsCount: o.items.length
      }));

      return {
        success: true,
        data: {
          count: mapped.length,
          orders: mapped
        }
      };
    }

    case 'get_order_details': {
      const ordId = String(params.orderId || '').trim().toLowerCase();
      const order = orders.find((o) => o.id.toLowerCase() === ordId || (o.salesOrderNo && o.salesOrderNo.toLowerCase() === ordId));
      if (!order) return { success: false, error: `Order '${params.orderId}' not found` };

      return {
        success: true,
        data: {
          ...order,
          items: order.items.map((i) => ({
            ...i,
            fefoSuggestedBatches: batches
              .filter((b) => b.sku === i.sku && b.status === 'ACTIVE' && b.quantityOnHand > 0)
              .sort((a, b) => new Date(a.bestBeforeDate).getTime() - new Date(b.bestBeforeDate).getTime())
              .slice(0, 3)
              .map((b) => ({ batchNo: b.batchNo, bestBeforeDate: b.bestBeforeDate, qty: b.quantityOnHand, loc: b.locationId }))
          }))
        }
      };
    }

    case 'receive_stock': {
      const { sku: skuCode, batchNo, quantity, locationId, bestBeforeDate, manufactureDate, supplier, unitCost } = params;
      if (!skuCode || !batchNo || quantity === undefined || !locationId || !bestBeforeDate) {
        return { success: false, error: 'Missing required parameters: sku, batchNo, quantity, locationId, bestBeforeDate' };
      }
      const qtyNum = Number(quantity);
      if (!Number.isFinite(qtyNum) || qtyNum <= 0) return { success: false, error: 'Quantity must be a number greater than 0' };
      if (!isDateStr(bestBeforeDate)) return { success: false, error: 'bestBeforeDate must be a real date written YYYY-MM-DD' };
      if (manufactureDate !== undefined && manufactureDate !== '' && !isDateStr(manufactureDate)) {
        return { success: false, error: 'manufactureDate must be a real date written YYYY-MM-DD' };
      }
      if (unitCost !== undefined && (!Number.isFinite(Number(unitCost)) || Number(unitCost) < 0)) {
        return { success: false, error: 'unitCost must be a number, 0 or more' };
      }

      const existingSku = skus.find((s) => s.sku.toLowerCase() === String(skuCode).toLowerCase());
      if (!existingSku) return { success: false, error: `SKU '${skuCode}' is not in the product list. Add it in the app first.` };
      const loc = locations.find((l) => l.id.toLowerCase() === String(locationId).toLowerCase());
      if (!loc) return { success: false, error: `Location '${locationId}' not found in the warehouse` };
      const itemName = existingSku.name;

      let batch = batches.find(
        (b) => b.batchNo.toLowerCase() === String(batchNo).toLowerCase() && b.sku.toLowerCase() === existingSku.sku.toLowerCase()
      );
      if (batch) {
        if (batch.locationId !== loc.id) {
          return { success: false, error: `Batch ${batch.batchNo} is already stored in ${batch.locationId}. Receive into that location, or move the batch first.` };
        }
        if (batch.status !== 'ACTIVE') {
          return { success: false, error: `Batch ${batch.batchNo} is ${batch.status}; it cannot receive more stock.` };
        }
        batch.quantityOnHand += qtyNum;
        batch.quantityAvailable = Math.max(0, batch.quantityOnHand - (batch.quantityAllocated || 0));
      } else {
        batch = {
          id: `BAT-${uid()}`,
          batchNo: String(batchNo),
          sku: existingSku.sku,
          itemName,
          quantityOnHand: qtyNum,
          quantityAllocated: 0,
          quantityAvailable: qtyNum,
          unitCost: unitCost !== undefined ? Number(unitCost) : (existingSku.unitCost ?? 0),
          bestBeforeDate: String(bestBeforeDate),
          manufactureDate: manufactureDate ? String(manufactureDate) : nowStamp().slice(0, 10),
          locationId: loc.id,
          status: 'ACTIVE',
          receivedAt: nowStamp(),
          supplier: supplier ? String(supplier) : 'External AI Agent Supplier'
        };
        batches.unshift(batch);
      }

      stockMovements.unshift({
        id: `LOG-${uid()}`,
        timestamp: nowStamp(),
        type: 'INBOUND_RECEIVE',
        sku: existingSku.sku,
        itemName,
        batchNo: String(batchNo),
        fromLocation: 'Receiving Dock',
        toLocation: loc.id,
        quantity: qtyNum,
        operator: 'Apex AI Agent',
        referenceDoc: 'AI_AGENT_INBOUND'
      });

      auditLogs.unshift({
        id: `AUD-${uid()}`,
        timestamp: nowStamp(),
        userId: 'USR-AI-AGENT',
        userName: 'Apex AI Agent',
        userRole: 'Admin',
        actionCategory: 'INVENTORY',
        actionType: 'STOCK_RECEIVE',
        targetEntity: `Batch ${batchNo} (${skuCode})`,
        details: `AI Agent received ${qtyNum} cartons into ${locationId}. BBD: ${bestBeforeDate}`,
        severity: 'INFO'
      });

      return {
        success: true,
        data: {
          batchNo: batch.batchNo,
          sku: batch.sku,
          quantityReceived: qtyNum,
          totalQuantityOnHand: batch.quantityOnHand,
          locationId: batch.locationId,
          bestBeforeDate: batch.bestBeforeDate
        }
      };
    }

    case 'adjust_stock': {
      const batchNo = String(params.batchNo || '').trim();
      const newQty = Number(params.newQuantity);
      const reason = String(params.reason || 'Cycle count adjustment via AI Agent');
      const operator = String(params.operator || 'Apex AI Agent');

      if (!batchNo || isNaN(newQty) || newQty < 0) {
        return { success: false, error: 'batchNo and non-negative newQuantity are required' };
      }

      const found = findBatch(batches, batchNo, params.sku);
      if (!found.batch) return { success: false, error: found.error };
      const batch = found.batch;

      const oldQty = batch.quantityOnHand;
      const diff = newQty - oldQty;
      batch.quantityOnHand = newQty;
      batch.quantityAvailable = Math.max(0, newQty - (batch.quantityAllocated || 0));

      stockMovements.unshift({
        id: `LOG-${uid()}`,
        timestamp: nowStamp(),
        type: 'ADJUSTMENT',
        sku: batch.sku,
        itemName: batch.itemName,
        batchNo: batch.batchNo,
        fromLocation: batch.locationId,
        toLocation: batch.locationId,
        quantity: Math.abs(diff),
        operator,
        referenceDoc: `AGENT_ADJUST: ${diff >= 0 ? '+' : ''}${diff} (${reason})`
      });

      auditLogs.unshift({
        id: `AUD-${uid()}`,
        timestamp: nowStamp(),
        userId: 'USR-AI-AGENT',
        userName: operator,
        userRole: 'Admin',
        actionCategory: 'INVENTORY',
        actionType: 'CYCLE_COUNT_ADJUST',
        targetEntity: `Batch ${batch.batchNo} (${batch.sku})`,
        details: `Adjusted quantity from ${oldQty} to ${newQty} (delta: ${diff}). Reason: ${reason}`,
        severity: Math.abs(diff) > 20 ? 'WARNING' : 'INFO'
      });

      return {
        success: true,
        data: {
          batchNo: batch.batchNo,
          sku: batch.sku,
          previousQuantity: oldQty,
          newQuantity: newQty,
          variance: diff,
          reason
        }
      };
    }

    case 'move_stock': {
      const batchNo = String(params.batchNo || '').trim();
      const toLocId = String(params.toLocationId || '').trim();
      const operator = String(params.operator || 'Apex AI Agent');

      if (!batchNo || !toLocId) return { success: false, error: 'batchNo and toLocationId are required' };

      const found = findBatch(batches, batchNo, params.sku);
      if (!found.batch) return { success: false, error: found.error };
      const batch = found.batch;
      if (params.quantity !== undefined && Number(params.quantity) !== batch.quantityOnHand) {
        return { success: false, error: `Only whole batches can be moved. Omit "quantity" or use ${batch.quantityOnHand} (the full quantity on hand).` };
      }

      const destLoc = locations.find((l) => l.id.toLowerCase() === toLocId.toLowerCase());
      if (!destLoc) return { success: false, error: `Destination location '${toLocId}' not found in warehouse` };

      const fromLocId = batch.locationId;
      if (fromLocId === destLoc.id) return { success: false, error: `Batch ${batch.batchNo} is already in ${destLoc.id}` };
      batch.locationId = destLoc.id;

      stockMovements.unshift({
        id: `LOG-${uid()}`,
        timestamp: nowStamp(),
        type: 'TRANSFER',
        sku: batch.sku,
        itemName: batch.itemName,
        batchNo: batch.batchNo,
        fromLocation: fromLocId,
        toLocation: destLoc.id,
        quantity: batch.quantityOnHand,
        operator,
        referenceDoc: 'AGENT_RELOCATION'
      });

      auditLogs.unshift({
        id: `AUD-${uid()}`,
        timestamp: nowStamp(),
        userId: 'USR-AI-AGENT',
        userName: operator,
        userRole: 'Admin',
        actionCategory: 'INVENTORY',
        actionType: 'STOCK_TRANSFER',
        targetEntity: `Batch ${batch.batchNo}`,
        details: `Relocated from ${fromLocId} to ${destLoc.id}. Quantity: ${batch.quantityOnHand}`,
        severity: 'INFO'
      });

      return {
        success: true,
        data: {
          batchNo: batch.batchNo,
          fromLocation: fromLocId,
          toLocation: destLoc.id,
          quantityMoved: batch.quantityOnHand
        }
      };
    }

    case 'optimize_pick_route': {
      let targetOrder: PickOrder | undefined;
      if (params.orderId) {
        targetOrder = orders.find((o) => o.id === params.orderId || o.salesOrderNo === params.orderId);
        if (!targetOrder) return { success: false, error: `Order '${params.orderId}' not found` };
      } else if (params.locationIds) {
        const locIds = String(params.locationIds).split(',').map((s) => s.trim()).filter(Boolean);
        if (locIds.length) {
          targetOrder = {
            id: 'ORD-AGENT-ROUTE',
            customerName: 'AI Route Optimizer',
            orderDate: nowStamp().slice(0, 10),
            requiredDeliveryDate: nowStamp().slice(0, 10),
            status: 'PENDING',
            priority: 'NORMAL',
            destinationZone: 'Staging',
            items: locIds.map((lid, idx) => {
              const matchedBatch = batches.find((b) => b.locationId === lid && b.status === 'ACTIVE' && b.quantityOnHand > 0);
              return {
                id: `LINE-${idx}`,
                sku: matchedBatch?.sku || 'SKU-ROUTE',
                itemName: matchedBatch?.itemName || 'Item',
                requestedQty: 1,
                pickedQty: 0,
                isPicked: false
              };
            })
          };
        }
      }

      if (!targetOrder) {
        return { success: false, error: 'Provide orderId or comma-separated locationIds' };
      }

      const routeResult = calculateOptimizedPickRoute(targetOrder, batches, locations);
      return {
        success: true,
        data: {
          orderId: targetOrder.id,
          totalDistanceMeters: routeResult.totalDistanceMeters,
          estimatedTimeMinutes: routeResult.estimatedTimeMinutes,
          savedDistancePercent: routeResult.savedDistancePercent,
          pickSequence: routeResult.nodes.map((n) => ({
            step: n.step,
            locationId: n.locationId,
            aisle: n.aisle,
            sku: n.sku,
            itemName: n.itemName,
            batchNo: n.batchNo,
            bestBeforeDate: n.bestBeforeDate,
            pickQty: n.pickQty,
            instruction: n.instruction
          }))
        }
      };
    }

    case 'execute_sql_query': {
      const q = String(params.query || '').trim();
      if (!/^SELECT\b/i.test(q) || /[;]|\b(INSERT|UPDATE|DELETE|DROP|ALTER|EXEC|MERGE|TRUNCATE|CREATE)\b/i.test(q)) {
        return { success: false, error: 'Only a single read-only SELECT is accepted' };
      }
      const note = 'Simulated listing: the query was NOT run. Only the table name was used and WHERE / JOIN / column lists were ignored. First 50 rows shown.';
      const listing = (rows: any[]) => ({ success: true, data: { simulated: true, note, rowCount: rows.length, rows: rows.slice(0, 50) } });
      if (/\bFROM\s+(dbo\.)?(Inventory|Skus)\b/i.test(q)) return listing(skus);
      if (/\bFROM\s+(dbo\.)?Batches\b/i.test(q)) return listing(batches);
      if (/\bFROM\s+(dbo\.)?Locations\b/i.test(q)) return listing(locations);
      if (/\bFROM\s+(dbo\.)?(PickOrders|SalesOrders)\b/i.test(q)) return listing(orders);
      if (/\bFROM\s+(dbo\.)?StockMovements\b/i.test(q)) return listing(stockMovements);
      return { success: false, error: 'Unknown table. Available: Skus, Batches, Locations, SalesOrders, StockMovements.' };
    }

    default:
      return { success: false, error: `Unknown tool: '${toolName}'` };
  }
}

export function generateOpenApiSpec(baseUrl: string) {
  return {
    openapi: '3.0.3',
    info: {
      title: 'ApexWMS AI Agent API',
      version: '1.0.0',
      description: 'Programmatic API and LLM Tool Interface for AI Agents, autonomous pickers, and inventory automation workflows in ApexWMS.'
    },
    servers: [{ url: `${baseUrl}/api/agent/v1` }],
    components: {
      securitySchemes: {
        ApiKeyAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'X-API-Key',
          description: 'AI Agent API Key provided in HTTP header'
        },
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          description: 'AI Agent API Key provided as Bearer token'
        }
      }
    },
    security: [{ ApiKeyAuth: [] }, { BearerAuth: [] }],
    paths: {
      '/status': {
        get: {
          summary: 'Get Warehouse Status',
          description: 'Returns real-time inventory counts, expiring lots, database health.',
          responses: { 200: { description: 'Warehouse status' } }
        }
      },
      '/tools': {
        get: {
          summary: 'List Agent Tool Declarations',
          description: 'Returns function definitions formatted for Gemini / OpenAI function calling.',
          responses: { 200: { description: 'List of agent tools' } }
        }
      },
      '/execute': {
        post: {
          summary: 'Execute Agent Tool',
          description: 'Executes an agent tool by name with parameters and returns structured results.',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    tool: { type: 'string' },
                    parameters: { type: 'object' }
                  },
                  required: ['tool']
                }
              }
            }
          },
          responses: { 200: { description: 'Execution result' } }
        }
      },
      '/inventory': {
        get: {
          summary: 'Search Inventory',
          parameters: [
            { name: 'query', in: 'query', required: false, schema: { type: 'string' } },
            { name: 'limit', in: 'query', required: false, schema: { type: 'integer' } }
          ],
          responses: { 200: { description: 'Inventory items' } }
        }
      },
      '/batches': {
        get: {
          summary: 'List Batches & FEFO Expiry',
          parameters: [
            { name: 'withinDays', in: 'query', required: false, schema: { type: 'integer' } },
            { name: 'status', in: 'query', required: false, schema: { type: 'string' } }
          ],
          responses: { 200: { description: 'Batches list' } }
        }
      },
      '/locations': {
        get: {
          summary: 'List Warehouse Locations',
          parameters: [
            { name: 'zone', in: 'query', required: false, schema: { type: 'string' } },
            { name: 'aisle', in: 'query', required: false, schema: { type: 'string' } }
          ],
          responses: { 200: { description: 'Locations list' } }
        }
      },
      '/orders': {
        get: {
          summary: 'List Orders',
          parameters: [
            { name: 'status', in: 'query', required: false, schema: { type: 'string' } }
          ],
          responses: { 200: { description: 'Orders list' } }
        }
      },
      '/chat': {
        post: {
          summary: 'Natural Language Agent Chat',
          description: 'Ask questions or instruct the warehouse agent in natural language. Powered by Gemini with live warehouse grounding.',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    message: { type: 'string' }
                  },
                  required: ['message']
                }
              }
            }
          },
          responses: { 200: { description: 'Agent response' } }
        }
      }
    }
  };
}
