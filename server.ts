import express from 'express';
import path from 'path';
import compression from 'compression';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import {
  INITIAL_SKUS,
  INITIAL_LOCATIONS,
  INITIAL_BATCHES,
  INITIAL_ORDERS,
  INITIAL_STOCK_MOVEMENTS,
  INITIAL_AUDIT_LOGS,
  INITIAL_PURCHASE_ORDERS,
  INITIAL_MSSQL_SCHEMA,
  INITIAL_CUSTOMERS,
  INITIAL_FACILITIES,
  INITIAL_ZONES
} from './src/data/initialData';
import { INITIAL_USERS, UserProfile, UserRole } from './src/types/roles';
import { calculateOptimizedPickRoute } from './src/utils/routeOptimizer';
import { Batch, PickOrder, StockMovement, ProductSKU, Location, AuditLogEntry, PurchaseOrder, CustomerProfile, WarehouseFacility, StorageZone } from './src/types/wms';

const app = express();
const PORT = 3000;

app.use(compression());
app.use(express.json({ limit: '10mb' }));

// In-memory Database State
let skusState: ProductSKU[] = [...INITIAL_SKUS];
let locationsState: Location[] = [...INITIAL_LOCATIONS];
let batchesState: Batch[] = [...INITIAL_BATCHES];
let ordersState: PickOrder[] = [...INITIAL_ORDERS];
let stockMovementsState: StockMovement[] = [...INITIAL_STOCK_MOVEMENTS];
let auditLogsState: AuditLogEntry[] = [...INITIAL_AUDIT_LOGS];
let purchaseOrdersState: PurchaseOrder[] = [...INITIAL_PURCHASE_ORDERS];
let usersState: UserProfile[] = [...INITIAL_USERS];
let customersState: CustomerProfile[] = [...INITIAL_CUSTOMERS];
let facilitiesState: WarehouseFacility[] = [...INITIAL_FACILITIES];
let zonesState: StorageZone[] = [...INITIAL_ZONES];
let deletedCategoriesState: string[] = [];
let mssqlSimulateOffline = false;

// Lazy Gemini AI Client initialization
function getGenAIClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build'
      }
    }
  });
}

// ==========================================
// API ROUTES
// ==========================================

// GET /api/health
app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    system: 'ApexWMS Server Engine',
    timestamp: new Date().toISOString(),
    dbType: 'MS SQL Server (Emulated T-SQL Engine)',
    stats: {
      totalSKUs: skusState.length,
      totalBatches: batchesState.length,
      totalLocations: locationsState.length,
      totalOrders: ordersState.length
    }
  });
});

// GET /api/customers - List all customer profiles
app.get('/api/customers', (req, res) => {
  res.json(customersState);
});

// POST /api/customers - Create new customer profile
app.post('/api/customers', (req, res) => {
  const { companyName, contactPerson, email, phone, address, customerCode, creditLimit, paymentTerms, preferredZone, notes } = req.body;

  if (!companyName || !companyName.trim()) {
    return res.status(400).json({ error: 'Company Name is required.' });
  }

  const id = `CUST-${Math.floor(1000 + Math.random() * 9000)}`;
  const code = customerCode || `CUST-${companyName.slice(0, 3).toUpperCase()}`;

  const newCustomer: CustomerProfile = {
    id,
    customerCode: code,
    companyName: companyName.trim(),
    contactPerson: contactPerson || 'Purchasing Manager',
    email: email || '',
    phone: phone || '',
    address: address || '',
    creditLimit: Number(creditLimit || 100000),
    paymentTerms: paymentTerms || 'NET 30',
    preferredZone: preferredZone || 'Outbound Express Bay 1',
    status: 'ACTIVE',
    notes: notes || ''
  };

  customersState.unshift(newCustomer);

  const timestampStr = new Date().toISOString().replace('T', ' ').slice(0, 19);
  auditLogsState.unshift({
    id: `AUD-${Date.now().toString().slice(-6)}`,
    timestamp: timestampStr,
    userId: 'USR-ADMIN-101',
    userName: 'Sales Operations Manager',
    userRole: 'Admin',
    actionCategory: 'INVENTORY',
    actionType: 'CUSTOMER_CREATED',
    targetEntity: code,
    details: `Created new customer profile: ${companyName} (${code}).`,
    severity: 'INFO'
  });

  res.json({ success: true, customer: newCustomer, customers: customersState });
});

// PUT /api/customers/:id - Update customer profile
app.put('/api/customers/:id', (req, res) => {
  const { id } = req.params;
  const decodedId = decodeURIComponent(id);
  const index = customersState.findIndex((c) => c.id === decodedId || c.customerCode === decodedId || c.id === id || c.customerCode === id);

  if (index === -1) {
    return res.status(404).json({ error: `Customer '${decodedId}' not found.` });
  }

  customersState[index] = {
    ...customersState[index],
    ...req.body
  };

  auditLogsState.unshift({
    id: `LOG-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    timestamp: new Date().toISOString(),
    userId: 'USR-101',
    userName: 'Operations Lead',
    userRole: 'Admin',
    actionCategory: 'INVENTORY',
    actionType: 'CUSTOMER_UPDATED',
    targetEntity: customersState[index].customerCode,
    details: `Updated customer profile: ${customersState[index].companyName} (${customersState[index].customerCode}).`,
    severity: 'INFO'
  });

  res.json({ success: true, customer: customersState[index], customers: customersState });
});

// DELETE /api/customers/:id - Delete customer profile
app.delete('/api/customers/:id', (req, res) => {
  const { id } = req.params;
  const decodedId = decodeURIComponent(id);
  const index = customersState.findIndex((c) => c.id === decodedId || c.customerCode === decodedId || c.id === id || c.customerCode === id);

  if (index === -1) {
    return res.status(404).json({ error: `Customer '${decodedId}' not found.` });
  }

  const removed = customersState.splice(index, 1)[0];

  auditLogsState.unshift({
    id: `LOG-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    timestamp: new Date().toISOString(),
    userId: 'USR-101',
    userName: 'Operations Lead',
    userRole: 'Admin',
    actionCategory: 'INVENTORY',
    actionType: 'CUSTOMER_DELETED',
    targetEntity: removed.customerCode,
    details: `Deleted customer profile: ${removed.companyName} (${removed.customerCode}).`,
    severity: 'WARNING'
  });

  res.json({ success: true, deletedId: removed.id, customers: customersState });
});

// GET /api/inventory - Full inventory state
app.get('/api/inventory', (req, res) => {
  // Sync SKUs & Catcher Gourmet Internal Sheet Balance Matrix state with live database batches and stock movements
  syncInventoryAndMatrixState();

  // Enrich batches with location details & expiry status
  const now = new Date().getTime();
  const enrichedBatches = batchesState.map((batch) => {
    const bbdTime = new Date(batch.bestBeforeDate).getTime();
    const daysUntilExpiry = Math.ceil((bbdTime - now) / (1000 * 3600 * 24));

    let expiryAlert: 'HEALTHY' | 'EXPIRING_SOON' | 'CRITICAL' | 'EXPIRED' = 'HEALTHY';
    if (daysUntilExpiry < 0) {
      expiryAlert = 'EXPIRED';
    } else if (daysUntilExpiry <= 14) {
      expiryAlert = 'CRITICAL';
    } else if (daysUntilExpiry <= 30) {
      expiryAlert = 'EXPIRING_SOON';
    }

    const loc = locationsState.find((l) => l.id === batch.locationId);

    return {
      ...batch,
      daysUntilExpiry,
      expiryAlert,
      locationDetails: loc
    };
  });

  res.json({
    skus: skusState,
    locations: locationsState,
    batches: enrichedBatches,
    stockMovements: stockMovementsState,
    facilities: facilitiesState,
    zones: zonesState
  });
});

// POST /api/inventory/receive - Inbound stock receiving with Batch No & Best Before Date
app.post('/api/inventory/receive', (req, res) => {
  const { sku, batchNo, manufactureDate, bestBeforeDate, supplier, locationId, quantity, unitCost, category } = req.body;

  if (!sku || !batchNo || !bestBeforeDate || !locationId || !quantity) {
    return res.status(400).json({ error: 'Missing required fields: sku, batchNo, bestBeforeDate, locationId, quantity' });
  }

  const skuObj = skusState.find((s) => s.sku === sku);
  if (!skuObj) {
    return res.status(404).json({ error: `SKU ${sku} not found.` });
  }

  if (category) {
    skuObj.category = category;
  }

  const newLotId = `LOT-${Date.now().toString().slice(-6)}`;
  const timestampStr = new Date().toISOString().replace('T', ' ').slice(0, 19);

  const newBatch: Batch = {
    id: newLotId,
    batchNo,
    sku,
    category: category || skuObj.category,
    itemName: skuObj.name,
    manufactureDate: manufactureDate || new Date().toISOString().split('T')[0],
    bestBeforeDate,
    supplier: supplier || 'Standard Supplier',
    locationId,
    quantityOnHand: Number(quantity),
    quantityAllocated: 0,
    quantityAvailable: Number(quantity),
    unitCost: Number(unitCost || 5.0),
    status: 'ACTIVE',
    receivedAt: timestampStr,
    notes: 'Inbound received via Floor Mobile App'
  };

  batchesState.unshift(newBatch);

  // Add stock movement log
  const newLog: StockMovement = {
    id: `LOG-${Date.now().toString().slice(-6)}`,
    timestamp: timestampStr,
    type: 'INBOUND_RECEIVE',
    sku,
    itemName: skuObj.name,
    batchNo,
    toLocation: locationId,
    quantity: Number(quantity),
    operator: 'Floor Op (Mobile Scanner)',
    referenceDoc: `PO-INBOUND-${Math.floor(1000 + Math.random() * 9000)}`
  };

  stockMovementsState.unshift(newLog);

  res.json({ success: true, batch: newBatch, movement: newLog });
});

// POST /api/inventory/quarantine - Quarantine hold for product recall & traceability
app.post('/api/inventory/quarantine', (req, res) => {
  const { batchNo, quarantineReason } = req.body;

  const targetBatches = batchesState.filter((b) => b.batchNo === batchNo);
  if (targetBatches.length === 0) {
    return res.status(404).json({ error: `Batch No ${batchNo} not found.` });
  }

  let updatedCount = 0;
  targetBatches.forEach((batch) => {
    batch.status = batch.status === 'QUARANTINED' ? 'ACTIVE' : 'QUARANTINED';
    if (batch.status === 'QUARANTINED') {
      batch.quantityAvailable = 0; // Lock available stock
    } else {
      batch.quantityAvailable = batch.quantityOnHand - batch.quantityAllocated;
    }
    batch.notes = quarantineReason ? `Quarantine Notice: ${quarantineReason}` : batch.notes;
    updatedCount++;
  });

  const timestampStr = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const movementLog: StockMovement = {
    id: `LOG-${Date.now().toString().slice(-6)}`,
    timestamp: timestampStr,
    type: 'QUARANTINE_HOLD',
    sku: targetBatches[0].sku,
    itemName: targetBatches[0].itemName,
    batchNo,
    toLocation: 'QUARANTINE_LOCKER',
    quantity: targetBatches[0].quantityOnHand,
    operator: 'QA Safety Auditor',
    referenceDoc: `RECALL-${Math.floor(100 + Math.random() * 900)}`
  };

  stockMovementsState.unshift(movementLog);

  res.json({
    success: true,
    batchNo,
    newStatus: targetBatches[0].status,
    updatedCount,
    movementLog
  });
});

// POST /api/inventory/outbound - Loose Stock Out / Outbound Request with Remark & Purpose, linked to Sales Order update
app.post('/api/inventory/outbound', (req, res) => {
  const {
    sku,
    batchNo,
    quantity,
    outboundPurpose,
    remark,
    operator,
    destination,
    salesOrderId,
    salesOrderItemId,
    createSalesOrderRecord,
    customerName
  } = req.body;

  const qtyNum = Number(quantity);
  if (!sku || isNaN(qtyNum) || qtyNum <= 0) {
    return res.status(400).json({ error: 'Missing required fields or invalid quantity (> 0).' });
  }

  const skuObj = skusState.find((s) => s.sku === sku);
  if (!skuObj) {
    return res.status(404).json({ error: `SKU ${sku} not found in inventory master.` });
  }

  // Find targeted batch or use FEFO (earliest bestBeforeDate)
  let targetBatch: Batch | null = null;
  if (batchNo && batchNo !== 'AUTO_FEFO') {
    targetBatch = batchesState.find((b) => b.batchNo === batchNo && b.status !== 'QUARANTINED') || null;
    if (!targetBatch) {
      return res.status(404).json({ error: `Active batch ${batchNo} not found or is currently quarantined.` });
    }
  } else {
    // Select earliest expiry non-quarantined batch with stock
    const candidateBatches = batchesState
      .filter((b) => b.sku === sku && b.status !== 'QUARANTINED' && b.quantityOnHand > 0)
      .sort((a, b) => new Date(a.bestBeforeDate).getTime() - new Date(b.bestBeforeDate).getTime());
    
    if (candidateBatches.length === 0) {
      return res.status(400).json({ error: `No active on-hand batches found for SKU ${sku}.` });
    }
    targetBatch = candidateBatches[0];
  }

  if (targetBatch.quantityOnHand < qtyNum) {
    return res.status(400).json({
      error: `Insufficient stock in batch ${targetBatch.batchNo}. Available on hand: ${targetBatch.quantityOnHand}, Requested Outbound: ${qtyNum}.`
    });
  }

  const timestampStr = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const purposeStr = outboundPurpose || 'Loose Stock Out Request';
  const remarkStr = remark ? String(remark).trim() : 'No remark specified';
  const destLocation = destination || 'Outbound Loose Dispatch Area';
  const opName = operator || 'Warehouse Dispatch Operator';

  // Deduct physical batch stock
  targetBatch.quantityOnHand -= qtyNum;
  targetBatch.quantityAllocated = Math.max(0, targetBatch.quantityAllocated - qtyNum);
  targetBatch.quantityAvailable = Math.max(0, targetBatch.quantityOnHand - targetBatch.quantityAllocated);

  let linkedOrder: PickOrder | null = null;
  let referenceDocNumber = `OUT-LOOSE-${Math.floor(1000 + Math.random() * 9000)}`;

  // Case 1: Linked to an existing Sales Order
  if (salesOrderId) {
    const orderIndex = ordersState.findIndex((o) => o.id === salesOrderId || o.salesOrderNo === salesOrderId);
    if (orderIndex !== -1) {
      linkedOrder = ordersState[orderIndex];
      referenceDocNumber = linkedOrder.salesOrderNo || linkedOrder.id;

      // Find target line item in the sales order
      let targetItem = salesOrderItemId
        ? linkedOrder.items.find((i) => i.id === salesOrderItemId)
        : linkedOrder.items.find((i) => i.sku === sku);

      if (!targetItem) {
        // If not found in order, add as an additional loose item row
        targetItem = {
          id: `ITEM-${linkedOrder.id}-${linkedOrder.items.length + 1}`,
          sku,
          itemName: skuObj.name,
          requestedQty: qtyNum,
          orderQtyCtn: qtyNum,
          allocateQty: qtyNum,
          fulfillmentQty: qtyNum,
          outstandingQty: 0,
          pickedQty: qtyNum,
          isPicked: true,
          remark: `[Loose Out: ${purposeStr}] ${remarkStr}`
        };
        linkedOrder.items.push(targetItem);
      } else {
        // Update existing item fulfillment
        targetItem.fulfillmentQty = (targetItem.fulfillmentQty || 0) + qtyNum;
        targetItem.pickedQty = (targetItem.pickedQty || 0) + qtyNum;
        const requested = targetItem.orderQtyCtn ?? targetItem.requestedQty ?? 0;
        targetItem.outstandingQty = Math.max(0, requested - targetItem.fulfillmentQty);
        targetItem.isPicked = targetItem.fulfillmentQty >= requested;
        
        const timestampNote = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        targetItem.remark = targetItem.remark
          ? `${targetItem.remark} | [${timestampNote} Loose Out ${qtyNum} CTN (${purposeStr}): ${remarkStr}]`
          : `[Loose Out ${qtyNum} CTN (${purposeStr}): ${remarkStr}]`;
      }

      // Recalculate sales order totals
      let totalOrderCtn = 0;
      let totalAllocatedCtn = 0;
      let totalFulfilledCtn = 0;

      linkedOrder.items.forEach((item) => {
        const oQty = item.orderQtyCtn ?? item.requestedQty ?? 0;
        const aQty = item.allocateQty ?? 0;
        const fQty = item.fulfillmentQty ?? item.pickedQty ?? 0;

        totalOrderCtn += oQty;
        totalAllocatedCtn += aQty;
        totalFulfilledCtn += fQty;
      });

      linkedOrder.totalOrderCtn = totalOrderCtn;
      linkedOrder.totalAllocatedCtn = totalAllocatedCtn;
      linkedOrder.totalFulfilledCtn = totalFulfilledCtn;
      linkedOrder.totalOutstandingCtn = Math.max(0, totalOrderCtn - totalFulfilledCtn);

      // Update Sales Order status
      if (totalFulfilledCtn >= totalOrderCtn && totalOrderCtn > 0) {
        linkedOrder.fulfillmentStatus = 'FULFILLED';
        linkedOrder.status = 'DONE';
      } else {
        linkedOrder.fulfillmentStatus = 'PARTIAL';
      }

      linkedOrder.remark = linkedOrder.remark
        ? `${linkedOrder.remark} | [Loose Outbound: ${qtyNum} CTN of ${sku} (${purposeStr})]`
        : `[Loose Outbound: ${qtyNum} CTN of ${sku} (${purposeStr}): ${remarkStr}]`;
    }
  } else if (createSalesOrderRecord) {
    // Case 2: Standalone loose outbound with option to create a tracked Sales Order record
    const soNumber = `SO-LOOSE-${Math.floor(1000 + Math.random() * 9000)}`;
    const newOrderId = `ORD-${Math.floor(9000 + Math.random() * 1000)}`;
    referenceDocNumber = soNumber;

    linkedOrder = {
      id: newOrderId,
      salesOrderNo: soNumber,
      poNumber: `LOOSE-REQ-${Math.floor(1000 + Math.random() * 9000)}`,
      customerName: customerName ? customerName.trim() : `Loose Request (${purposeStr})`,
      orderDate: timestampStr,
      requiredDeliveryDate: timestampStr.slice(0, 10),
      status: 'DONE',
      priority: 'NORMAL',
      destinationZone: destLocation,
      fulfillmentStatus: 'FULFILLED',
      totalOrderCtn: qtyNum,
      totalAllocatedCtn: qtyNum,
      totalFulfilledCtn: qtyNum,
      totalOutstandingCtn: 0,
      remark: `[Purpose: ${purposeStr}] ${remarkStr}`,
      items: [
        {
          id: `ITEM-${newOrderId}-1`,
          sku,
          itemName: skuObj.name,
          requestedQty: qtyNum,
          orderQtyCtn: qtyNum,
          allocateQty: qtyNum,
          fulfillmentQty: qtyNum,
          outstandingQty: 0,
          pickedQty: qtyNum,
          isPicked: true,
          remark: `Loose stock out: ${remarkStr}`
        }
      ]
    };

    ordersState.unshift(linkedOrder);
  }

  // Create Stock Movement log
  const movementLog: StockMovement = {
    id: `LOG-${Date.now().toString().slice(-6)}`,
    timestamp: timestampStr,
    type: 'DISPATCH',
    sku,
    itemName: skuObj.name,
    batchNo: targetBatch.batchNo,
    fromLocation: targetBatch.locationId,
    toLocation: destLocation,
    quantity: qtyNum,
    operator: opName,
    referenceDoc: referenceDocNumber
  };
  stockMovementsState.unshift(movementLog);

  // Sync entire inventory balance matrix & reserved calculations
  syncInventoryAndMatrixState();

  // Create Audit Log Entry
  const auditEntry: AuditLogEntry = {
    id: `AUD-${Date.now().toString().slice(-6)}`,
    timestamp: timestampStr,
    userId: 'USR-OPERATOR-101',
    userName: opName,
    userRole: 'Warehouse Manager',
    actionCategory: 'INVENTORY',
    actionType: 'STOCK_OUT_DISPATCH',
    targetEntity: `${sku} / ${targetBatch.batchNo}`,
    details: `Outbound loose stock of ${qtyNum} CTN (${purposeStr}). Remark: "${remarkStr}". Deducted from Lot ${targetBatch.batchNo} at ${targetBatch.locationId}. ${
      linkedOrder ? `Updated Sales Order ${linkedOrder.salesOrderNo || linkedOrder.id}.` : ''
    }`,
    severity: 'INFO'
  };
  auditLogsState.unshift(auditEntry);

  res.json({
    success: true,
    message: `Successfully outbounded ${qtyNum} CTN of ${skuObj.name} (Lot ${targetBatch.batchNo}).`,
    batch: targetBatch,
    movement: movementLog,
    order: linkedOrder,
    skus: skusState,
    batches: batchesState,
    orders: ordersState,
    auditLog: auditEntry
  });
});

// POST /api/inventory/adjust - Stock Take Adjustment (Physical Count Variance, Add, Deduct)
app.post('/api/inventory/adjust', (req, res) => {
  const { sku, batchNo, adjustmentType, countedQuantity, reasonCode, notes, operator, locationId } = req.body;

  if (!sku || countedQuantity === undefined || countedQuantity === null) {
    return res.status(400).json({ error: 'Missing required fields: sku, countedQuantity' });
  }

  const skuObj = skusState.find((s) => s.sku === sku);
  if (!skuObj) {
    return res.status(404).json({ error: `SKU ${sku} not found.` });
  }

  const timestampStr = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const qtyNum = Number(countedQuantity);
  const type: 'SET_EXACT' | 'ADD' | 'SUBTRACT' = adjustmentType || 'SET_EXACT';
  let variance = 0;

  // Find targeted batch or primary batch for the SKU
  let targetBatch = batchNo ? batchesState.find((b) => b.batchNo === batchNo) : null;
  if (!targetBatch) {
    targetBatch = batchesState.find((b) => b.sku === sku) || null;
  }

  if (targetBatch) {
    const prevQty = targetBatch.quantityOnHand;
    if (type === 'SET_EXACT') {
      variance = qtyNum - prevQty;
      targetBatch.quantityOnHand = qtyNum;
    } else if (type === 'ADD') {
      variance = qtyNum;
      targetBatch.quantityOnHand += qtyNum;
    } else if (type === 'SUBTRACT') {
      variance = -qtyNum;
      targetBatch.quantityOnHand = Math.max(0, targetBatch.quantityOnHand - qtyNum);
    }
    targetBatch.quantityAvailable = Math.max(0, targetBatch.quantityOnHand - targetBatch.quantityAllocated);
    targetBatch.notes = notes ? `Stock Take Adj (${reasonCode || 'CYCLE_COUNT'}): ${notes}` : targetBatch.notes;
  } else {
    // If no batch exists, create an adjustment batch lot
    const newLotId = `LOT-ADJ-${Date.now().toString().slice(-6)}`;
    const newBatchNo = batchNo || `BATCH-ADJ-${Math.floor(1000 + Math.random() * 9000)}`;
    const newQty = type === 'SUBTRACT' ? 0 : qtyNum;
    variance = newQty;

    targetBatch = {
      id: newLotId,
      batchNo: newBatchNo,
      sku,
      itemName: skuObj.name,
      manufactureDate: new Date().toISOString().split('T')[0],
      bestBeforeDate: new Date(Date.now() + 180 * 24 * 3600 * 1000).toISOString().split('T')[0],
      supplier: 'Stock Take Adjustment',
      locationId: locationId || 'BAY-ADJ-01',
      quantityOnHand: newQty,
      quantityAllocated: 0,
      quantityAvailable: newQty,
      unitCost: skuObj.unitCost || 14.5,
      status: 'ACTIVE',
      receivedAt: timestampStr,
      notes: `Created via Stock Take Adjustment (${reasonCode || 'CYCLE_COUNT'})`
    };
    batchesState.unshift(targetBatch);
  }

  // Update SKU aggregates if present
  if (skuObj.exactQty !== undefined) {
    skuObj.exactQty = Math.max(0, skuObj.exactQty + variance);
  }
  if (skuObj.currentQty !== undefined) {
    skuObj.currentQty = Math.max(0, skuObj.currentQty + variance);
  }

  // Record Stock Movement log
  const movementLog: StockMovement = {
    id: `LOG-${Date.now().toString().slice(-6)}`,
    timestamp: timestampStr,
    type: 'ADJUSTMENT',
    sku,
    itemName: skuObj.name,
    batchNo: targetBatch ? targetBatch.batchNo : 'N/A',
    fromLocation: variance < 0 ? (targetBatch?.locationId || 'BAY-MAIN') : 'ADJUSTMENT_VIRTUAL',
    toLocation: variance >= 0 ? (targetBatch?.locationId || 'BAY-MAIN') : 'SHRINKAGE_DISPOSAL',
    quantity: Math.abs(variance),
    operator: operator || 'Stock Auditor',
    referenceDoc: `ADJ-${reasonCode || 'CYCLE_COUNT'}-${Math.floor(1000 + Math.random() * 9000)}`
  };
  stockMovementsState.unshift(movementLog);

  // Record Audit Log Entry
  const auditEntry: AuditLogEntry = {
    id: `AUD-${Date.now().toString().slice(-6)}`,
    timestamp: timestampStr,
    userId: 'USR-AUDITOR-202',
    userName: operator || 'Stock Take Auditor',
    userRole: 'Warehouse Manager',
    actionCategory: 'INVENTORY',
    actionType: 'STOCK_ADJUSTED',
    targetEntity: sku,
    details: `Stock Take Adjustment for ${skuObj.name} (${sku}): Mode=${type}, Quantity=${qtyNum}, Net Variance=${variance > 0 ? '+' : ''}${variance} units. Reason: ${reasonCode || 'CYCLE_COUNT'}. Notes: ${notes || 'None'}`,
    severity: variance === 0 ? 'INFO' : Math.abs(variance) > 50 ? 'WARNING' : 'INFO'
  };
  auditLogsState.unshift(auditEntry);

  res.json({
    success: true,
    variance,
    batch: targetBatch,
    sku: skuObj,
    movement: movementLog,
    audit: auditEntry
  });
});

// POST /api/inventory/import-skus - Bulk CSV SKU Import
app.post('/api/inventory/import-skus', (req, res) => {
  const { items, operator, mode = 'OVERWRITE' } = req.body;
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'No valid SKU items provided in request array.' });
  }

  const importedSKUs: ProductSKU[] = [];
  let addedCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;
  const timestampStr = new Date().toISOString().replace('T', ' ').slice(0, 19);

  items.forEach((item) => {
    if (!item.sku || !item.name) return;

    const skuCode = String(item.sku).trim().toUpperCase();
    const existingIndex = skusState.findIndex((s) => s.sku === skuCode);

    const minLevel = Number(item.minStockLevel) || 20;
    const reorderQty = Number(item.reorderQuantity) || 50;
    const cost = Number(item.unitCost) || 14.5;
    const initQty = Number(item.initialQty ?? item.currentQty) || 0;

    const skuPayload: ProductSKU = {
      sku: skuCode,
      name: String(item.name).trim(),
      category: String(item.category || 'General Products').trim(),
      currentQty: initQty,
      exactQty: initQty,
      stockIn: initQty,
      stockOut: 0,
      reserved: 0,
      balanceForward: initQty,
      minStockLevel: minLevel,
      reorderQuantity: reorderQty,
      reorderPoint: minLevel,
      safetyStock: Math.round(minLevel / 2),
      weightPerUnitKg: Number(item.weightPerUnitKg) || 1.2,
      barcode: String(item.barcode || skuCode),
      unitCost: cost,
      unit: String(item.unit || 'Bottle').trim(),
      storageZone: item.storageZone || 'DRY',
      description: String(item.description || 'Imported via CSV Bulk Upload').trim(),
      monthlyBalances: {
        JAN: initQty, FEB: initQty, MAR: initQty, APR: initQty, MAY: initQty, JUN: initQty,
        JUL: initQty, AUG: initQty, SEP: initQty, OCT: initQty, NOV: initQty, DEC: initQty
      }
    };

    if (existingIndex >= 0) {
      if (mode === 'SKIP_EXISTING') {
        skippedCount++;
        return; // Skip modifying existing
      } else if (mode === 'MERGE_STOCK') {
        const existing = skusState[existingIndex];
        existing.currentQty = (existing.currentQty || 0) + initQty;
        existing.exactQty = (existing.exactQty || 0) + initQty;
        existing.stockIn = (existing.stockIn || 0) + initQty;
        updatedCount++;
        importedSKUs.push(existing);
      } else {
        // OVERWRITE mode
        skusState[existingIndex] = { ...skusState[existingIndex], ...skuPayload };
        updatedCount++;
        importedSKUs.push(skusState[existingIndex]);
      }
    } else {
      skusState.push(skuPayload);
      addedCount++;
      importedSKUs.push(skuPayload);
    }
  });

  // Audit Log Entry
  const auditEntry: AuditLogEntry = {
    id: `AUD-${Date.now().toString().slice(-6)}`,
    timestamp: timestampStr,
    userId: 'USR-CSV-IMP',
    userName: operator || 'System Admin',
    userRole: 'Warehouse Manager',
    actionCategory: 'INVENTORY',
    actionType: 'SKU_CREATED',
    targetEntity: 'SKU Catalog CSV Bulk Import',
    details: `Bulk CSV SKU Import (${mode} mode). Total Processed: ${importedSKUs.length} (Added: ${addedCount}, Updated: ${updatedCount}, Skipped: ${skippedCount}).`,
    severity: 'INFO'
  };
  auditLogsState.unshift(auditEntry);

  res.json({
    success: true,
    addedCount,
    updatedCount,
    skippedCount,
    totalProcessed: items.length,
    skus: importedSKUs
  });
});

// POST /api/inventory/import-batches - Bulk CSV Batch Lots Import
app.post('/api/inventory/import-batches', (req, res) => {
  const { items, operator, mode = 'OVERWRITE' } = req.body;
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'No valid batch items provided in request array.' });
  }

  const importedBatches: Batch[] = [];
  let addedCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;
  const timestampStr = new Date().toISOString().replace('T', ' ').slice(0, 19);

  items.forEach((item) => {
    if (!item.batchNo || !item.sku) return;

    const batchNoCode = String(item.batchNo).trim().toUpperCase();
    const skuCode = String(item.sku).trim().toUpperCase();
    const existingIndex = batchesState.findIndex((b) => b.batchNo === batchNoCode);

    const qty = Number(item.quantityOnHand ?? item.quantity) || 0;
    const cost = Number(item.unitCost) || 14.5;
    const mfgDate = item.manufactureDate || new Date().toISOString().split('T')[0];
    const bbdDate = item.bestBeforeDate || new Date(Date.now() + 180 * 24 * 3600 * 1000).toISOString().split('T')[0];

    const skuObj = skusState.find((s) => s.sku === skuCode);

    const batchPayload: Batch = {
      id: `LOT-IMP-${Date.now().toString().slice(-5)}-${Math.floor(Math.random() * 1000)}`,
      batchNo: batchNoCode,
      sku: skuCode,
      itemName: skuObj ? skuObj.name : String(item.itemName || skuCode).trim(),
      manufactureDate: mfgDate,
      bestBeforeDate: bbdDate,
      supplier: String(item.supplier || 'CSV Import Supplier').trim(),
      locationId: String(item.locationId || 'BAY-MAIN').trim(),
      quantityOnHand: qty,
      quantityAllocated: 0,
      quantityAvailable: qty,
      unitCost: cost,
      status: (item.status === 'QUARANTINE' ? 'QUARANTINE' : 'ACTIVE') as any,
      receivedAt: timestampStr,
      notes: String(item.notes || 'Imported via CSV Batch Upload').trim()
    };

    if (existingIndex >= 0) {
      if (mode === 'SKIP_EXISTING') {
        skippedCount++;
        return;
      } else if (mode === 'MERGE_STOCK') {
        const existingB = batchesState[existingIndex];
        existingB.quantityOnHand += qty;
        existingB.quantityAvailable += qty;
        updatedCount++;
        importedBatches.push(existingB);
      } else {
        batchesState[existingIndex] = { ...batchesState[existingIndex], ...batchPayload };
        updatedCount++;
        importedBatches.push(batchesState[existingIndex]);
      }
    } else {
      batchesState.unshift(batchPayload);
      addedCount++;
      importedBatches.push(batchPayload);
    }

    // Update SKU totals
    if (skuObj && mode !== 'SKIP_EXISTING') {
      skuObj.exactQty = (skuObj.exactQty || 0) + qty;
      skuObj.currentQty = (skuObj.currentQty || 0) + qty;
      skuObj.stockIn = (skuObj.stockIn || 0) + qty;
    }
  });

  // Audit Log Entry
  const auditEntry: AuditLogEntry = {
    id: `AUD-${Date.now().toString().slice(-6)}`,
    timestamp: timestampStr,
    userId: 'USR-CSV-IMP',
    userName: operator || 'System Admin',
    userRole: 'Warehouse Manager',
    actionCategory: 'INVENTORY',
    actionType: 'INBOUND_RECEIVED',
    targetEntity: 'Batch Lots CSV Bulk Import',
    details: `Bulk Batch CSV Import (${mode} mode). Processed: ${items.length} (Added: ${addedCount}, Updated: ${updatedCount}, Skipped: ${skippedCount}).`,
    severity: 'INFO'
  };
  auditLogsState.unshift(auditEntry);

  res.json({
    success: true,
    addedCount,
    updatedCount,
    skippedCount,
    totalProcessed: items.length,
    batches: importedBatches
  });
});

// GET /api/purchase-orders - Fetch generated purchase orders
app.get('/api/purchase-orders', (req, res) => {
  res.json(purchaseOrdersState);
});

// POST /api/skus - Create new SKU catalog entry
app.post('/api/skus', (req, res) => {
  const { sku, name, category, description, unit, reorderPoint, safetyStock, barcode, storageZone } = req.body;

  if (!sku || !name || !category) {
    return res.status(400).json({ error: 'Missing required SKU parameters: sku, name, category' });
  }

  const existing = skusState.find((s) => s.sku.toLowerCase() === sku.toLowerCase());
  if (existing) {
    return res.status(400).json({ error: `SKU code '${sku}' already exists in catalog.` });
  }

  const newSku: ProductSKU = {
    sku: sku.toUpperCase().trim(),
    name: name.trim(),
    category: category.trim(),
    description: description || `${name} product SKU`,
    unit: unit || 'units',
    reorderPoint: Number(reorderPoint || 100),
    safetyStock: Number(safetyStock || 50),
    weightPerUnitKg: Number(req.body.weightPerUnitKg || 1.2),
    barcode: barcode || `890${Math.floor(100000000 + Math.random() * 900000000)}`,
    storageZone: storageZone || 'DRY'
  };

  skusState.unshift(newSku);

  // Add audit log
  const timestampStr = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const auditEntry: AuditLogEntry = {
    id: `AUD-${Date.now().toString().slice(-6)}`,
    timestamp: timestampStr,
    userId: 'USR-ADMIN-101',
    userName: 'Inventory Master',
    userRole: 'Admin',
    actionCategory: 'INVENTORY',
    actionType: 'SKU_CREATED',
    targetEntity: newSku.sku,
    details: `Created new SKU entry '${newSku.sku}' (${newSku.name}) under category '${newSku.category}' with reorder point ${newSku.reorderPoint}.`,
    severity: 'INFO'
  };
  auditLogsState.unshift(auditEntry);

  res.json({ success: true, sku: newSku, auditLog: auditEntry });
});

// PUT /api/skus/:skuCode - Update SKU catalog item details (Category, Name, Description, etc.)
app.put('/api/skus/:skuCode', (req, res) => {
  const { skuCode } = req.params;
  const { name, category, description, unit, reorderPoint, safetyStock, storageZone, weightPerUnitKg } = req.body;

  const targetIndex = skusState.findIndex((s) => s.sku.toLowerCase() === skuCode.toLowerCase());
  if (targetIndex === -1) {
    return res.status(404).json({ error: `SKU '${skuCode}' not found in catalog.` });
  }

  const existing = skusState[targetIndex];
  const oldCategory = existing.category;
  const updatedSku: ProductSKU = {
    ...existing,
    ...(name && { name: name.trim() }),
    ...(category && { category: category.trim() }),
    ...(description !== undefined && { description: description.trim() }),
    ...(unit && { unit: unit.trim() }),
    ...(reorderPoint !== undefined && { reorderPoint: Number(reorderPoint) }),
    ...(safetyStock !== undefined && { safetyStock: Number(safetyStock) }),
    ...(storageZone && { storageZone }),
    ...(weightPerUnitKg !== undefined && { weightPerUnitKg: Number(weightPerUnitKg) })
  };

  skusState[targetIndex] = updatedSku;

  // Also update category on matching batches if category changed
  if (category && category !== oldCategory) {
    batchesState.forEach((b) => {
      if (b.sku.toLowerCase() === skuCode.toLowerCase()) {
        b.category = category.trim();
      }
    });
  }

  // Add audit log
  const timestampStr = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const auditEntry: AuditLogEntry = {
    id: `AUD-${Date.now().toString().slice(-6)}`,
    timestamp: timestampStr,
    userId: 'USR-ADMIN-101',
    userName: 'Inventory Master',
    userRole: 'Admin',
    actionCategory: 'INVENTORY',
    actionType: 'SKU_UPDATED',
    targetEntity: updatedSku.sku,
    details: `Updated SKU '${updatedSku.sku}' details. Category changed from '${oldCategory}' to '${updatedSku.category}'.`,
    severity: 'INFO'
  };
  auditLogsState.unshift(auditEntry);

  res.json({ success: true, sku: updatedSku, auditLog: auditEntry });
});

// PUT /api/categories/rename - Rename an existing category globally across all SKUs and Batches
app.put('/api/categories/rename', (req, res) => {
  const { oldCategory, newCategory } = req.body;

  if (!oldCategory || !newCategory || !oldCategory.trim() || !newCategory.trim()) {
    return res.status(400).json({ error: 'Both oldCategory and newCategory are required.' });
  }

  const oldCatClean = oldCategory.trim();
  const newCatClean = newCategory.trim();

  let skuCount = 0;
  skusState.forEach((s) => {
    if (s.category.toLowerCase() === oldCatClean.toLowerCase()) {
      s.category = newCatClean;
      skuCount++;
    }
  });

  let batchCount = 0;
  batchesState.forEach((b) => {
    if (b.category && b.category.toLowerCase() === oldCatClean.toLowerCase()) {
      b.category = newCatClean;
      batchCount++;
    }
  });

  const timestampStr = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const auditEntry: AuditLogEntry = {
    id: `AUD-${Date.now().toString().slice(-6)}`,
    timestamp: timestampStr,
    userId: 'USR-ADMIN-101',
    userName: 'Inventory Master',
    userRole: 'Admin',
    actionCategory: 'INVENTORY',
    actionType: 'CATEGORY_RENAMED',
    targetEntity: oldCatClean,
    details: `Globally renamed category '${oldCatClean}' to '${newCatClean}' across ${skuCount} SKUs and ${batchCount} batches.`,
    severity: 'INFO'
  };
  auditLogsState.unshift(auditEntry);

  res.json({
    success: true,
    oldCategory: oldCatClean,
    newCategory: newCatClean,
    updatedSkusCount: skuCount,
    updatedBatchesCount: batchCount,
    auditLog: auditEntry
  });
});

// POST /api/categories/delete - Delete a category and reassign SKUs to a target category
app.post('/api/categories/delete', (req, res) => {
  const { categoryName, reassignTo = 'General Products' } = req.body;

  if (!categoryName || !categoryName.trim()) {
    return res.status(400).json({ error: 'categoryName is required.' });
  }

  const catClean = categoryName.trim();
  const targetCat = reassignTo.trim();

  let skuCount = 0;
  skusState.forEach((s) => {
    if (s.category.toLowerCase() === catClean.toLowerCase()) {
      s.category = targetCat;
      skuCount++;
    }
  });

  let batchCount = 0;
  batchesState.forEach((b) => {
    if (b.category && b.category.toLowerCase() === catClean.toLowerCase()) {
      b.category = targetCat;
      batchCount++;
    }
  });

  if (!deletedCategoriesState.includes(catClean)) {
    deletedCategoriesState.push(catClean);
  }

  const timestampStr = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const auditEntry: AuditLogEntry = {
    id: `AUD-${Date.now().toString().slice(-6)}`,
    timestamp: timestampStr,
    userId: 'USR-ADMIN-101',
    userName: 'Inventory Master',
    userRole: 'Admin',
    actionCategory: 'INVENTORY',
    actionType: 'CATEGORY_DELETED',
    targetEntity: catClean,
    details: `Deleted category '${catClean}' and reassigned ${skuCount} SKUs to '${targetCat}'.`,
    severity: 'WARNING'
  };
  auditLogsState.unshift(auditEntry);

  res.json({
    success: true,
    deletedCategory: catClean,
    reassignedTo: targetCat,
    updatedSkusCount: skuCount,
    updatedBatchesCount: batchCount,
    auditLog: auditEntry
  });
});

// POST /api/locations - Create a new Warehouse Facility Bin Location
app.post('/api/locations', (req, res) => {
  const { aisle, rack, shelf, bin, zone, capacityKg, gridX, gridY } = req.body;

  if (!aisle || !rack || !shelf || !bin || !zone) {
    return res.status(400).json({ error: 'Missing required location fields: aisle, rack, shelf, bin, zone' });
  }

  const rackNum = Number(rack);
  const shelfNum = Number(shelf);
  const aisleUpper = String(aisle).trim().toUpperCase();
  const binStr = String(bin).trim().padStart(2, '0');
  const id = `${aisleUpper}-${String(rackNum).padStart(2, '0')}-${binStr}`;

  const existing = locationsState.find((l) => l.id === id);
  if (existing) {
    return res.status(400).json({ error: `Location ID ${id} already exists in warehouse grid.` });
  }

  const newLoc = {
    id,
    aisle: aisleUpper,
    rack: rackNum,
    shelf: shelfNum,
    bin: binStr,
    zone: zone || 'DRY',
    gridX: gridX || (aisleUpper === 'A' ? 2 : aisleUpper === 'B' ? 6 : aisleUpper === 'C' ? 10 : 14),
    gridY: gridY || (rackNum * 2),
    capacityKg: Number(capacityKg) || 500,
    currentKg: 0
  };

  locationsState.push(newLoc);

  const timestampStr = new Date().toISOString().replace('T', ' ').slice(0, 19);
  auditLogsState.unshift({
    id: `AUD-${Date.now().toString().slice(-6)}`,
    timestamp: timestampStr,
    userId: 'USR-ADMIN-101',
    userName: 'Warehouse Administrator',
    userRole: 'Admin',
    actionCategory: 'INVENTORY',
    actionType: 'LOCATION_CREATED',
    targetEntity: id,
    details: `Created new Putaway Bin Location ${id} in Zone ${zone} (Aisle ${aisleUpper}, Rack ${rackNum}, Capacity ${newLoc.capacityKg}kg).`,
    severity: 'INFO'
  });

  res.json({ success: true, location: newLoc, locations: locationsState });
});

// PUT /api/locations/:id - Update an existing Warehouse Bin Location
app.put('/api/locations/:id', (req, res) => {
  const { id } = req.params;
  const index = locationsState.findIndex((l) => l.id === id);

  if (index === -1) {
    return res.status(404).json({ error: `Location ID ${id} not found.` });
  }

  locationsState[index] = {
    ...locationsState[index],
    ...req.body
  };

  res.json({ success: true, location: locationsState[index], locations: locationsState });
});

// DELETE /api/locations/:id - Delete a Warehouse Bin Location
app.delete('/api/locations/:id', (req, res) => {
  const { id } = req.params;
  const decodedId = decodeURIComponent(id);
  const index = locationsState.findIndex((l) => l.id === decodedId || l.id === id);

  if (index === -1) {
    return res.status(404).json({ error: `Location ID ${decodedId} not found.` });
  }

  // Safely reassign any batches in this location
  batchesState.forEach((b) => {
    if (b.locationId === locationsState[index].id || b.locationId === id) {
      b.locationId = 'UNASSIGNED';
    }
  });

  const removed = locationsState.splice(index, 1)[0];

  const timestampStr = new Date().toISOString().replace('T', ' ').slice(0, 19);
  auditLogsState.unshift({
    id: `AUD-${Date.now().toString().slice(-6)}`,
    timestamp: timestampStr,
    userId: 'USR-ADMIN-101',
    userName: 'Warehouse Administrator',
    userRole: 'Admin',
    actionCategory: 'INVENTORY',
    actionType: 'LOCATION_DELETED',
    targetEntity: removed.id,
    details: `Deleted Warehouse Bin Location ${removed.id}.`,
    severity: 'WARNING'
  });

  res.json({ success: true, deletedId: removed.id, locations: locationsState });
});

// ==========================================
// WAREHOUSE FACILITIES API
// ==========================================

// GET /api/facilities
app.get('/api/facilities', (req, res) => {
  res.json(facilitiesState);
});

// POST /api/facilities - Create new warehouse facility
app.post('/api/facilities', (req, res) => {
  const { code, name, address, managerName, contactPhone, status, totalAreaSqFt } = req.body;

  if (!code || !name) {
    return res.status(400).json({ error: 'Facility code and name are required.' });
  }

  const existing = facilitiesState.find((f) => f.code.toUpperCase() === String(code).trim().toUpperCase());
  if (existing) {
    return res.status(400).json({ error: `Facility with code '${code}' already exists.` });
  }

  const newFacility: WarehouseFacility = {
    id: `FAC-${String(facilitiesState.length + 1).padStart(2, '0')}`,
    code: String(code).trim().toUpperCase(),
    name: String(name).trim(),
    address: address || '',
    managerName: managerName || 'Unassigned',
    contactPhone: contactPhone || '',
    status: status || 'ACTIVE',
    totalAreaSqFt: Number(totalAreaSqFt) || 25000
  };

  facilitiesState.push(newFacility);

  const timestampStr = new Date().toISOString().replace('T', ' ').slice(0, 19);
  auditLogsState.unshift({
    id: `AUD-${Date.now().toString().slice(-6)}`,
    timestamp: timestampStr,
    userId: 'USR-ADMIN-101',
    userName: 'Warehouse Administrator',
    userRole: 'Admin',
    actionCategory: 'INVENTORY',
    actionType: 'FACILITY_CREATED',
    targetEntity: newFacility.id,
    details: `Created new Warehouse Facility '${newFacility.name}' (${newFacility.code}).`,
    severity: 'INFO'
  });

  res.json({ success: true, facility: newFacility, facilities: facilitiesState });
});

// PUT /api/facilities/:id - Update facility profile
app.put('/api/facilities/:id', (req, res) => {
  const { id } = req.params;
  const index = facilitiesState.findIndex((f) => f.id === id || f.code === id);

  if (index === -1) {
    return res.status(404).json({ error: `Facility '${id}' not found.` });
  }

  facilitiesState[index] = {
    ...facilitiesState[index],
    ...req.body
  };

  const timestampStr = new Date().toISOString().replace('T', ' ').slice(0, 19);
  auditLogsState.unshift({
    id: `AUD-${Date.now().toString().slice(-6)}`,
    timestamp: timestampStr,
    userId: 'USR-ADMIN-101',
    userName: 'Warehouse Administrator',
    userRole: 'Admin',
    actionCategory: 'INVENTORY',
    actionType: 'FACILITY_UPDATED',
    targetEntity: facilitiesState[index].id,
    details: `Updated Warehouse Facility profile '${facilitiesState[index].name}' (${facilitiesState[index].code}).`,
    severity: 'INFO'
  });

  res.json({ success: true, facility: facilitiesState[index], facilities: facilitiesState });
});

// DELETE /api/facilities/:id - Delete facility
app.delete('/api/facilities/:id', (req, res) => {
  const { id } = req.params;
  const decodedId = decodeURIComponent(id);
  const index = facilitiesState.findIndex((f) => f.id === decodedId || f.code === decodedId || f.id === id || f.code === id);

  if (index === -1) {
    return res.status(404).json({ error: `Facility '${decodedId}' not found.` });
  }

  const deletedFacility = facilitiesState.splice(index, 1)[0];

  const timestampStr = new Date().toISOString().replace('T', ' ').slice(0, 19);
  auditLogsState.unshift({
    id: `AUD-${Date.now().toString().slice(-6)}`,
    timestamp: timestampStr,
    userId: 'USR-ADMIN-101',
    userName: 'Warehouse Administrator',
    userRole: 'Admin',
    actionCategory: 'INVENTORY',
    actionType: 'FACILITY_DELETED',
    targetEntity: decodedId,
    details: `Deleted Warehouse Facility '${deletedFacility.name}' (${deletedFacility.code}).`,
    severity: 'WARNING'
  });

  res.json({ success: true, deletedId: decodedId, facilities: facilitiesState });
});

// ==========================================
// STORAGE ZONES API
// ==========================================

// GET /api/zones
app.get('/api/zones', (req, res) => {
  res.json(zonesState);
});

// POST /api/zones - Create new storage zone
app.post('/api/zones', (req, res) => {
  const { code, title, temperatureRange, description, aisle, icon, themeColor, facilityId, maxCapacityKg } = req.body;

  if (!code || !title) {
    return res.status(400).json({ error: 'Zone code and title are required.' });
  }

  const zoneCodeClean = String(code).trim().toUpperCase().replace(/\s+/g, '_');
  const existing = zonesState.find((z) => z.code === zoneCodeClean);

  if (existing) {
    return res.status(400).json({ error: `Storage zone with code '${zoneCodeClean}' already exists.` });
  }

  const newZone: StorageZone = {
    code: zoneCodeClean,
    title: String(title).trim(),
    temperatureRange: temperatureRange || 'Ambient',
    description: description || '',
    aisle: aisle || 'Aisle A',
    icon: icon || '📦',
    themeColor: themeColor || 'emerald',
    facilityId: facilityId || 'FAC-01',
    maxCapacityKg: Number(maxCapacityKg) || 10000
  };

  zonesState.push(newZone);

  const timestampStr = new Date().toISOString().replace('T', ' ').slice(0, 19);
  auditLogsState.unshift({
    id: `AUD-${Date.now().toString().slice(-6)}`,
    timestamp: timestampStr,
    userId: 'USR-ADMIN-101',
    userName: 'Warehouse Administrator',
    userRole: 'Admin',
    actionCategory: 'INVENTORY',
    actionType: 'ZONE_CREATED',
    targetEntity: zoneCodeClean,
    details: `Created new Storage Zone '${newZone.title}' (${zoneCodeClean}).`,
    severity: 'INFO'
  });

  res.json({ success: true, zone: newZone, zones: zonesState });
});

// PUT /api/zones/:code - Update storage zone details
app.put('/api/zones/:code', (req, res) => {
  const { code } = req.params;
  const index = zonesState.findIndex((z) => z.code === code);

  if (index === -1) {
    return res.status(404).json({ error: `Storage zone '${code}' not found.` });
  }

  zonesState[index] = {
    ...zonesState[index],
    ...req.body
  };

  const timestampStr = new Date().toISOString().replace('T', ' ').slice(0, 19);
  auditLogsState.unshift({
    id: `AUD-${Date.now().toString().slice(-6)}`,
    timestamp: timestampStr,
    userId: 'USR-ADMIN-101',
    userName: 'Warehouse Administrator',
    userRole: 'Admin',
    actionCategory: 'INVENTORY',
    actionType: 'ZONE_UPDATED',
    targetEntity: code,
    details: `Updated Storage Zone settings for '${zonesState[index].title}' (${code}).`,
    severity: 'INFO'
  });

  res.json({ success: true, zone: zonesState[index], zones: zonesState });
});

// DELETE /api/zones/:code - Delete storage zone
app.delete('/api/zones/:code', (req, res) => {
  const { code } = req.params;
  const decodedCode = decodeURIComponent(code);
  const index = zonesState.findIndex((z) => z.code === decodedCode || z.code === code);

  if (index === -1) {
    return res.status(404).json({ error: `Storage zone '${decodedCode}' not found.` });
  }

  // Safely reassign locations bound to this zone to 'DRY'
  locationsState.forEach((l) => {
    if (l.zone === zonesState[index].code || l.zone === code) {
      l.zone = 'DRY';
    }
  });

  const deletedZone = zonesState.splice(index, 1)[0];

  const timestampStr = new Date().toISOString().replace('T', ' ').slice(0, 19);
  auditLogsState.unshift({
    id: `AUD-${Date.now().toString().slice(-6)}`,
    timestamp: timestampStr,
    userId: 'USR-ADMIN-101',
    userName: 'Warehouse Administrator',
    userRole: 'Admin',
    actionCategory: 'INVENTORY',
    actionType: 'ZONE_DELETED',
    targetEntity: decodedCode,
    details: `Deleted Storage Zone '${deletedZone.title}' (${decodedCode}).`,
    severity: 'WARNING'
  });

  res.json({ success: true, deletedCode: decodedCode, zones: zonesState });
});

// POST /api/purchase-orders - Generate purchase order for low-stock SKU
app.post('/api/purchase-orders', (req, res) => {
  const { sku, itemName, supplier, reorderQuantity, unitCost, expectedDeliveryDate, generatedBy, destinationLocationId, notes } = req.body;

  if (!sku || !reorderQuantity) {
    return res.status(400).json({ error: 'Missing required parameters: sku and reorderQuantity' });
  }

  const skuObj = skusState.find((s) => s.sku === sku);
  const matchedBatch = batchesState.find((b) => b.sku === sku);
  const timestampStr = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const newPoId = `PO-2026-${Math.floor(1000 + Math.random() * 9000)}`;

  const finalCost = Number(unitCost || matchedBatch?.unitCost || 12.50);
  const finalQty = Number(reorderQuantity);

  const newPo: PurchaseOrder = {
    id: newPoId,
    createdAt: timestampStr,
    sku,
    itemName: itemName || skuObj?.name || 'Reorder Product',
    supplier: supplier || matchedBatch?.supplier || 'Primary Global Logistics',
    reorderQuantity: finalQty,
    unitCost: finalCost,
    totalCost: finalQty * finalCost,
    expectedDeliveryDate: expectedDeliveryDate || new Date(Date.now() + 5 * 86400000).toISOString().split('T')[0],
    status: 'ISSUED',
    generatedBy: generatedBy || 'Warehouse Manager',
    destinationLocationId: destinationLocationId || matchedBatch?.locationId || 'A-01-01',
    notes: notes || `Auto-PO generated for SKU ${sku} due to low stock / reorder threshold reached.`
  };

  purchaseOrdersState.unshift(newPo);

  // Add an audit log entry for this purchase order creation
  const auditEntry: AuditLogEntry = {
    id: `AUD-${Date.now().toString().slice(-6)}`,
    timestamp: timestampStr,
    userId: 'USR-ADMIN-101',
    userName: generatedBy || 'Warehouse Manager',
    userRole: 'Admin',
    actionCategory: 'INBOUND',
    actionType: 'PURCHASE_ORDER_GENERATED',
    targetEntity: newPoId,
    details: `Generated Purchase Order ${newPoId} for ${finalQty} units of ${newPo.itemName} (${sku}) at $${finalCost}/unit (Total: $${(finalQty * finalCost).toFixed(2)}).`,
    severity: 'INFO'
  };
  auditLogsState.unshift(auditEntry);

  res.json({ success: true, purchaseOrder: newPo, auditLog: auditEntry });
});

// DELETE /api/purchase-orders/:id - Delete a purchase order
app.delete('/api/purchase-orders/:id', (req, res) => {
  const { id } = req.params;
  const decodedId = decodeURIComponent(id);

  const existingIndex = purchaseOrdersState.findIndex((po) => po.id === decodedId);
  if (existingIndex === -1) {
    return res.status(404).json({ error: `Purchase Order '${decodedId}' not found.` });
  }

  const removedPo = purchaseOrdersState[existingIndex];
  purchaseOrdersState.splice(existingIndex, 1);

  const timestampStr = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const auditEntry: AuditLogEntry = {
    id: `AUD-${Date.now().toString().slice(-6)}`,
    timestamp: timestampStr,
    userId: 'USR-ADMIN-101',
    userName: 'Warehouse Manager',
    userRole: 'Admin',
    actionCategory: 'INBOUND',
    actionType: 'PURCHASE_ORDER_DELETED',
    targetEntity: decodedId,
    details: `Deleted Purchase Order ${decodedId} for ${removedPo.reorderQuantity} units of ${removedPo.itemName} (${removedPo.sku}).`,
    severity: 'WARNING'
  };
  auditLogsState.unshift(auditEntry);

  res.json({ success: true, deletedId: decodedId, auditLog: auditEntry });
});

// DELETE /api/stock-movements - Clear all stock movement logs
app.delete('/api/stock-movements', (req, res) => {
  const previousCount = stockMovementsState.length;
  stockMovementsState = [];

  const timestampStr = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const auditEntry: AuditLogEntry = {
    id: `AUD-${Date.now().toString().slice(-6)}`,
    timestamp: timestampStr,
    userId: 'USR-ADMIN-101',
    userName: 'Warehouse Manager',
    userRole: 'Admin',
    actionCategory: 'INVENTORY',
    actionType: 'STOCK_MOVEMENTS_CLEARED',
    targetEntity: 'Stock Movement Stream',
    details: `Cleared ${previousCount} stock movement log records from system stream.`,
    severity: 'WARNING'
  };
  auditLogsState.unshift(auditEntry);

  res.json({ success: true, clearedCount: previousCount, stockMovements: [], auditLog: auditEntry });
});

// ==========================================
// USER PROFILE MANAGEMENT API ROUTES
// ==========================================

// GET /api/users - Fetch all team member profiles
app.get('/api/users', (req, res) => {
  res.json(usersState);
});

// POST /api/users - Create a new team member profile
app.post('/api/users', (req, res) => {
  const { name, email, role, department, shift, badgeCode } = req.body;

  if (!name || !name.trim() || !email || !email.trim() || !role) {
    return res.status(400).json({ error: 'Name, email, and role are required fields.' });
  }

  const newUserId = `USR-${Math.floor(100 + Math.random() * 900)}`;
  const newUser: UserProfile = {
    id: newUserId,
    name: name.trim(),
    email: email.trim(),
    role: role as UserRole,
    department: department?.trim() || 'Warehouse Operations',
    shift: shift?.trim() || 'First Shift (07:00 - 15:30)',
    badgeCode: badgeCode?.trim() || `BDG-${Math.floor(1000 + Math.random() * 9000)}`
  };

  usersState.push(newUser);

  const timestampStr = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const auditEntry: AuditLogEntry = {
    id: `AUD-${Date.now().toString().slice(-6)}`,
    timestamp: timestampStr,
    userId: 'USR-ADMIN-101',
    userName: 'System Administrator',
    userRole: 'Admin',
    actionCategory: 'ROLE_MANAGEMENT',
    actionType: 'USER_CREATED',
    targetEntity: newUser.name,
    details: `Created new team member profile for ${newUser.name} (${newUser.role}, ${newUser.email}).`,
    severity: 'INFO'
  };
  auditLogsState.unshift(auditEntry);

  res.json({ success: true, user: newUser, auditLog: auditEntry });
});

// PUT /api/users/:id - Update an existing team member profile
app.put('/api/users/:id', (req, res) => {
  const { id } = req.params;
  const { name, email, role, department, shift, badgeCode } = req.body;

  const userIndex = usersState.findIndex((u) => u.id === id);
  if (userIndex === -1) {
    return res.status(404).json({ error: `User profile ${id} not found.` });
  }

  const existingUser = usersState[userIndex];
  const updatedUser: UserProfile = {
    ...existingUser,
    name: name !== undefined ? name.trim() : existingUser.name,
    email: email !== undefined ? email.trim() : existingUser.email,
    role: role !== undefined ? (role as UserRole) : existingUser.role,
    department: department !== undefined ? department.trim() : existingUser.department,
    shift: shift !== undefined ? shift.trim() : existingUser.shift,
    badgeCode: badgeCode !== undefined ? badgeCode.trim() : existingUser.badgeCode
  };

  usersState[userIndex] = updatedUser;

  const timestampStr = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const auditEntry: AuditLogEntry = {
    id: `AUD-${Date.now().toString().slice(-6)}`,
    timestamp: timestampStr,
    userId: 'USR-ADMIN-101',
    userName: 'System Administrator',
    userRole: 'Admin',
    actionCategory: 'ROLE_MANAGEMENT',
    actionType: 'USER_PROFILE_UPDATED',
    targetEntity: updatedUser.name,
    details: `Updated team member profile for ${updatedUser.name} (${updatedUser.role}, ${updatedUser.email}).`,
    severity: 'INFO'
  };
  auditLogsState.unshift(auditEntry);

  res.json({ success: true, user: updatedUser, auditLog: auditEntry });
});

// DELETE /api/users/:id - Delete a team member profile
app.delete('/api/users/:id', (req, res) => {
  const { id } = req.params;

  if (usersState.length <= 1) {
    return res.status(400).json({ error: 'Cannot delete the only remaining user in the system.' });
  }

  const targetUser = usersState.find((u) => u.id === id);
  if (!targetUser) {
    return res.status(404).json({ error: `User profile ${id} not found.` });
  }

  usersState = usersState.filter((u) => u.id !== id);

  const timestampStr = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const auditEntry: AuditLogEntry = {
    id: `AUD-${Date.now().toString().slice(-6)}`,
    timestamp: timestampStr,
    userId: 'USR-ADMIN-101',
    userName: 'System Administrator',
    userRole: 'Admin',
    actionCategory: 'ROLE_MANAGEMENT',
    actionType: 'USER_DELETED',
    targetEntity: targetUser.name,
    details: `Deleted team member profile for ${targetUser.name} (${targetUser.role}).`,
    severity: 'WARNING'
  };
  auditLogsState.unshift(auditEntry);

  res.json({ success: true, deletedId: id, auditLog: auditEntry });
});

// GET /api/orders - Get orders
app.get('/api/orders', (req, res) => {
  res.json(ordersState);
});

// Helper function to sync reserved stock & Catcher Gourmet Internal Sheet Balance Matrix across all SKUs based on active batches, orders, and stock movements
function syncInventoryAndMatrixState() {
  const currentMonthCode = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'][new Date().getMonth()];

  // Pre-aggregate active batches by SKU
  const activeBatchesBySku = new Map<string, Batch[]>();
  const batchOnHandBySku = new Map<string, number>();

  batchesState.forEach((batch) => {
    if (batch.status === 'ACTIVE') {
      const existing = activeBatchesBySku.get(batch.sku) || [];
      existing.push(batch);
      activeBatchesBySku.set(batch.sku, existing);

      const currentSum = batchOnHandBySku.get(batch.sku) || 0;
      batchOnHandBySku.set(batch.sku, currentSum + (batch.quantityOnHand || 0));
    }
  });

  // Pre-aggregate stock movements by SKU
  const movementsBySku = new Map<string, { inbound: number; outbound: number }>();
  stockMovementsState.forEach((mov) => {
    const entry = movementsBySku.get(mov.sku) || { inbound: 0, outbound: 0 };
    if (mov.type === 'INBOUND_RECEIVE' || mov.type === 'PUTAWAY') {
      entry.inbound += mov.quantity || 0;
    } else if (mov.type === 'PICKING' || mov.type === 'DISPATCH') {
      entry.outbound += mov.quantity || 0;
    }
    movementsBySku.set(mov.sku, entry);
  });

  // Pre-aggregate reserved stock from open sales orders by SKU
  const reservedStockBySku = new Map<string, number>();
  ordersState.forEach((order) => {
    if (order.status !== 'CANCELLED' && order.status !== 'COMPLETED' && order.status !== 'DONE') {
      order.items.forEach((item) => {
        const itemAlloc = item.allocateQty ?? item.requestedQty ?? 0;
        const itemFulfilled = item.fulfillmentQty ?? item.pickedQty ?? 0;
        const activeAlloc = Math.max(0, itemAlloc - itemFulfilled);
        if (activeAlloc > 0) {
          const currentRes = reservedStockBySku.get(item.sku) || 0;
          reservedStockBySku.set(item.sku, currentRes + activeAlloc);
        }
      });
    }
  });

  const monthsList = [
    'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'
  ] as const;

  skusState.forEach((skuObj) => {
    const matchingBatches = activeBatchesBySku.get(skuObj.sku) || [];
    const batchOnHand = batchOnHandBySku.get(skuObj.sku) || 0;
    const movs = movementsBySku.get(skuObj.sku) || { inbound: 0, outbound: 0 };
    const skuReserved = reservedStockBySku.get(skuObj.sku) || 0;

    skuObj.reserved = skuReserved;

    const initBal = skuObj.balanceForward ?? skuObj.currentQty ?? batchOnHand;
    skuObj.balanceForward = initBal;

    skuObj.stockIn = movs.inbound > 0 ? (initBal + movs.inbound) : (skuObj.stockIn ?? (initBal + batchOnHand));
    skuObj.stockOut = movs.outbound;

    const realCurrentQty = batchOnHand > 0 || matchingBatches.length > 0 ? batchOnHand : Math.max(0, skuObj.stockIn - skuObj.stockOut);
    skuObj.currentQty = realCurrentQty;
    skuObj.exactQty = realCurrentQty - skuReserved;

    if (!skuObj.monthlyBalances) {
      skuObj.monthlyBalances = {};
    }

    monthsList.forEach((m) => {
      if (skuObj.monthlyBalances![m] === undefined || skuObj.monthlyBalances![m] === null) {
        skuObj.monthlyBalances![m] = realCurrentQty;
      }
    });

    skuObj.monthlyBalances[currentMonthCode as keyof typeof skuObj.monthlyBalances] = realCurrentQty;
  });

  // Re-allocate batches via FEFO for active allocations
  skusState.forEach((skuObj) => {
    let remainingToAlloc = skuObj.reserved || 0;
    const matchingBatches = activeBatchesBySku.get(skuObj.sku) || [];
    if (matchingBatches.length > 0) {
      const sortedBatches = [...matchingBatches].sort(
        (a, b) => new Date(a.bestBeforeDate).getTime() - new Date(b.bestBeforeDate).getTime()
      );

      sortedBatches.forEach((batch, idx) => {
        const isLast = idx === sortedBatches.length - 1;
        let allocForBatch = Math.min(batch.quantityOnHand, remainingToAlloc);
        if (isLast && remainingToAlloc > batch.quantityOnHand) {
          allocForBatch = remainingToAlloc;
        }
        batch.quantityAllocated = allocForBatch;
        batch.quantityAvailable = batch.quantityOnHand - allocForBatch;
        remainingToAlloc -= allocForBatch;
      });
    }
  });
}

// Alias for backward compatibility
const syncReservedStockState = syncInventoryAndMatrixState;

// POST /api/matrix/sync - Force sync Catcher Gourmet Internal Sheet Balance Matrix with Database
app.post('/api/matrix/sync', (req, res) => {
  syncInventoryAndMatrixState();

  const timestampStr = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const auditEntry: AuditLogEntry = {
    id: `AUD-${Date.now().toString().slice(-6)}`,
    timestamp: timestampStr,
    userId: 'USR-ADMIN-101',
    userName: 'System Admin',
    userRole: 'Warehouse Manager',
    actionCategory: 'INVENTORY',
    actionType: 'MATRIX_SYNCED',
    targetEntity: 'Catcher Gourmet Internal Sheet Balance Matrix',
    details: `Synchronized Catcher Gourmet Internal Sheet Balance Matrix across ${skusState.length} SKUs with live database batches and stock movement logs.`,
    severity: 'INFO'
  };
  auditLogsState.unshift(auditEntry);

  res.json({
    success: true,
    message: `Successfully synchronized ${skusState.length} SKUs in Catcher Gourmet Internal Sheet Balance Matrix with database`,
    skus: skusState,
    batches: batchesState,
    auditLog: auditEntry
  });
});

// POST /api/sales-orders - Create new Sales Order
app.post('/api/sales-orders', (req, res) => {
  const { salesOrderNo, poNumber, customerName, requiredDeliveryDate, priority, destinationZone, items, remark } = req.body;

  if (!customerName || !items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Missing required sales order fields: customerName and items array' });
  }

  const timestampStr = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const soNumber = salesOrderNo || `SO-2026-${Math.floor(1000 + Math.random() * 9000)}`;
  const orderId = `ORD-${Math.floor(9000 + Math.random() * 1000)}`;

  let totalOrderCtn = 0;
  let totalAllocatedCtn = 0;

  const orderItems = items.map((item: any, idx: number) => {
    const skuObj = skusState.find((s) => s.sku === item.sku);
    const orderQty = Number(item.orderQtyCtn || item.requestedQty || 0);
    const allocQty = Number(item.allocateQty !== undefined ? item.allocateQty : orderQty);
    
    totalOrderCtn += orderQty;
    totalAllocatedCtn += allocQty;

    return {
      id: `ITEM-${orderId}-${idx + 1}`,
      sku: item.sku,
      itemName: item.itemName || skuObj?.name || item.sku,
      requestedQty: orderQty,
      orderQtyCtn: orderQty,
      allocateQty: allocQty,
      fulfillmentQty: 0,
      outstandingQty: orderQty,
      pickedQty: 0,
      isPicked: false,
      remark: item.remark || ''
    };
  });

  const isFullyAllocated = totalAllocatedCtn >= totalOrderCtn && totalOrderCtn > 0;
  const isPartiallyAllocated = totalAllocatedCtn > 0 && totalAllocatedCtn < totalOrderCtn;

  const newSalesOrder: PickOrder = {
    id: orderId,
    salesOrderNo: soNumber,
    poNumber: poNumber || `PO-${Math.floor(1000 + Math.random() * 9000)}`,
    customerName: customerName.trim(),
    orderDate: timestampStr,
    requiredDeliveryDate: requiredDeliveryDate || new Date(Date.now() + 3 * 86400000).toISOString().split('T')[0],
    status: isFullyAllocated ? 'PENDING' : 'PENDING',
    priority: priority || 'NORMAL',
    destinationZone: destinationZone || 'Outbound Express Bay 1',
    fulfillmentStatus: isFullyAllocated ? 'OUTSTANDING' : isPartiallyAllocated ? 'PARTIAL' : 'OUTSTANDING',
    totalOrderCtn,
    totalAllocatedCtn,
    totalFulfilledCtn: 0,
    totalOutstandingCtn: totalOrderCtn,
    remark: remark || 'New customer sales order created.',
    items: orderItems
  };

  ordersState.unshift(newSalesOrder);

  // Sync reserved stock across catalog
  syncReservedStockState();

  // Audit log
  const auditEntry: AuditLogEntry = {
    id: `AUD-${Date.now().toString().slice(-6)}`,
    timestamp: timestampStr,
    userId: 'USR-ADMIN-101',
    userName: 'Sales Operations Manager',
    userRole: 'Admin',
    actionCategory: 'INVENTORY',
    actionType: 'SALES_ORDER_CREATED',
    targetEntity: soNumber,
    details: `Created Sales Order ${soNumber} for ${customerName} (${totalOrderCtn} CTN ordered, ${totalAllocatedCtn} CTN allocated/reserved).`,
    severity: 'INFO'
  };
  auditLogsState.unshift(auditEntry);

  res.json({
    success: true,
    order: newSalesOrder,
    skus: skusState,
    batches: batchesState,
    auditLog: auditEntry
  });
});

// PUT /api/sales-orders/:id/allocation - Update allocation quantity & reserve stock
app.put('/api/sales-orders/:id/allocation', (req, res) => {
  const { id } = req.params;
  const { items, remark } = req.body;

  const orderIndex = ordersState.findIndex((o) => o.id === id || o.salesOrderNo === id);
  if (orderIndex === -1) {
    return res.status(404).json({ error: `Sales Order ${id} not found.` });
  }

  const targetOrder = ordersState[orderIndex];
  if (targetOrder.isLocked) {
    return res.status(400).json({ error: `Sales Order ${id} is locked and marked DONE. Unlock it first to modify allocations.` });
  }
  const timestampStr = new Date().toISOString().replace('T', ' ').slice(0, 19);

  let totalOrderCtn = 0;
  let totalAllocatedCtn = 0;
  let totalFulfilledCtn = 0;

  if (Array.isArray(items)) {
    items.forEach((updateItem: any) => {
      const lineItem = targetOrder.items.find((i) => i.sku === updateItem.sku || i.id === updateItem.id);
      if (lineItem) {
        if (updateItem.orderQtyCtn !== undefined) lineItem.orderQtyCtn = Number(updateItem.orderQtyCtn);
        if (updateItem.requestedQty !== undefined) lineItem.requestedQty = Number(updateItem.requestedQty);
        if (updateItem.allocateQty !== undefined) lineItem.allocateQty = Number(updateItem.allocateQty);
        if (updateItem.fulfillmentQty !== undefined) lineItem.fulfillmentQty = Number(updateItem.fulfillmentQty);
        if (updateItem.remark !== undefined) lineItem.remark = updateItem.remark;

        const orderQty = lineItem.orderQtyCtn ?? lineItem.requestedQty ?? 0;
        const fulQty = lineItem.fulfillmentQty ?? lineItem.pickedQty ?? 0;
        lineItem.outstandingQty = Math.max(0, orderQty - fulQty);
      }
    });
  }

  // Recalculate order totals
  targetOrder.items.forEach((item) => {
    const orderQty = item.orderQtyCtn ?? item.requestedQty ?? 0;
    const allocQty = item.allocateQty ?? 0;
    const fulQty = item.fulfillmentQty ?? item.pickedQty ?? 0;

    totalOrderCtn += orderQty;
    totalAllocatedCtn += allocQty;
    totalFulfilledCtn += fulQty;
  });

  targetOrder.totalOrderCtn = totalOrderCtn;
  targetOrder.totalAllocatedCtn = totalAllocatedCtn;
  targetOrder.totalFulfilledCtn = totalFulfilledCtn;
  targetOrder.totalOutstandingCtn = Math.max(0, totalOrderCtn - totalFulfilledCtn);

  if (remark) {
    targetOrder.remark = remark;
  }

  // Update order fulfillment status
  if (totalFulfilledCtn >= totalOrderCtn && totalOrderCtn > 0) {
    targetOrder.fulfillmentStatus = 'FULFILLED';
    targetOrder.status = 'DONE';
  } else if (totalAllocatedCtn >= totalOrderCtn && totalOrderCtn > 0) {
    targetOrder.fulfillmentStatus = 'OUTSTANDING';
    targetOrder.status = 'PENDING';
  } else {
    targetOrder.fulfillmentStatus = 'PARTIAL';
  }

  // Recalculate global reserved stock & batch allocations
  syncReservedStockState();

  // Audit log
  const auditEntry: AuditLogEntry = {
    id: `AUD-${Date.now().toString().slice(-6)}`,
    timestamp: timestampStr,
    userId: 'USR-ADMIN-101',
    userName: 'Sales Operations Manager',
    userRole: 'Admin',
    actionCategory: 'INVENTORY',
    actionType: 'SALES_ORDER_ALLOCATION_UPDATED',
    targetEntity: targetOrder.salesOrderNo || targetOrder.id,
    details: `Updated allocation for Sales Order ${targetOrder.salesOrderNo || targetOrder.id}: ${totalAllocatedCtn} CTN allocated / reserved out of ${totalOrderCtn} CTN requested.`,
    severity: 'INFO'
  };
  auditLogsState.unshift(auditEntry);

  res.json({
    success: true,
    order: targetOrder,
    skus: skusState,
    batches: batchesState,
    auditLog: auditEntry
  });
});

// POST /api/sales-orders/:id/auto-allocate - Auto FEFO Allocation
app.post('/api/sales-orders/:id/auto-allocate', (req, res) => {
  const { id } = req.params;

  const targetOrder = ordersState.find((o) => o.id === id || o.salesOrderNo === id);
  if (!targetOrder) {
    return res.status(404).json({ error: `Sales Order ${id} not found.` });
  }

  let totalAllocatedCtn = 0;

  targetOrder.items.forEach((item) => {
    const orderQty = item.orderQtyCtn ?? item.requestedQty ?? 0;
    // Directly allocate 100% of the requested order quantity regardless of stock levels
    item.allocateQty = orderQty;
    totalAllocatedCtn += orderQty;
  });

  targetOrder.totalAllocatedCtn = totalAllocatedCtn;

  // Re-sync reserved stock across system
  syncReservedStockState();

  const timestampStr = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const auditEntry: AuditLogEntry = {
    id: `AUD-${Date.now().toString().slice(-6)}`,
    timestamp: timestampStr,
    userId: 'USR-ADMIN-101',
    userName: 'Automated Allocation Engine',
    userRole: 'Admin',
    actionCategory: 'INVENTORY',
    actionType: 'AUTO_ALLOCATE_SUCCESS',
    targetEntity: targetOrder.salesOrderNo || targetOrder.id,
    details: `Auto-allocated FEFO stock for Sales Order ${targetOrder.salesOrderNo || targetOrder.id}. Total allocated: ${totalAllocatedCtn} CTN.`,
    severity: 'INFO'
  };
  auditLogsState.unshift(auditEntry);

  res.json({
    success: true,
    order: targetOrder,
    skus: skusState,
    batches: batchesState,
    auditLog: auditEntry
  });
});

// DELETE /api/sales-orders/:id - Delete or Cancel Sales Order
app.delete('/api/sales-orders/:id', (req, res) => {
  const { id } = req.params;

  const orderIndex = ordersState.findIndex((o) => o.id === id || o.salesOrderNo === id);
  if (orderIndex === -1) {
    return res.status(404).json({ error: `Sales Order ${id} not found.` });
  }

  const deletedOrder = ordersState[orderIndex];
  if (deletedOrder.isLocked) {
    return res.status(400).json({ error: `Sales Order ${id} is locked and marked DONE. Unlock it first if you wish to delete it.` });
  }
  ordersState.splice(orderIndex, 1);

  // Sync reserved stock state
  syncReservedStockState();

  const timestampStr = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const auditEntry: AuditLogEntry = {
    id: `AUD-${Date.now().toString().slice(-6)}`,
    timestamp: timestampStr,
    userId: 'USR-ADMIN-101',
    userName: 'Sales Operations Manager',
    userRole: 'Admin',
    actionCategory: 'INVENTORY',
    actionType: 'SALES_ORDER_DELETED',
    targetEntity: deletedOrder.salesOrderNo || deletedOrder.id,
    details: `Deleted Sales Order ${deletedOrder.salesOrderNo || deletedOrder.id} and released reserved stock allocation.`,
    severity: 'WARNING'
  };
  auditLogsState.unshift(auditEntry);

  res.json({
    success: true,
    deletedId: id,
    skus: skusState,
    batches: batchesState,
    auditLog: auditEntry
  });
});

// POST /api/sales-orders/:id/lock - Lock or unlock a Sales Order
app.post('/api/sales-orders/:id/lock', (req, res) => {
  const { id } = req.params;
  const { isLocked } = req.body;

  const targetOrder = ordersState.find((o) => o.id === id || o.salesOrderNo === id);
  if (!targetOrder) {
    return res.status(404).json({ error: `Sales Order ${id} not found.` });
  }

  const shouldLock = isLocked !== undefined ? Boolean(isLocked) : !targetOrder.isLocked;
  targetOrder.isLocked = shouldLock;

  const timestampStr = new Date().toISOString().replace('T', ' ').slice(0, 19);

  if (shouldLock) {
    targetOrder.status = 'DONE';
    targetOrder.fulfillmentStatus = 'FULFILLED';
    targetOrder.lockedAt = timestampStr;
    // Mark items fulfilled if locked
    targetOrder.items.forEach((item) => {
      if ((item.fulfillmentQty || 0) < (item.orderQtyCtn || item.requestedQty || 0)) {
        item.fulfillmentQty = item.orderQtyCtn || item.requestedQty || 0;
        item.pickedQty = item.fulfillmentQty;
        item.outstandingQty = 0;
        item.isPicked = true;
      }
    });
    const totalOrderCtn = targetOrder.items.reduce((sum, i) => sum + (i.orderQtyCtn || i.requestedQty || 0), 0);
    targetOrder.totalFulfilledCtn = totalOrderCtn;
    targetOrder.totalOutstandingCtn = 0;
  }

  syncReservedStockState();

  const auditEntry: AuditLogEntry = {
    id: `AUD-${Date.now().toString().slice(-6)}`,
    timestamp: timestampStr,
    userId: 'USR-ADMIN-101',
    userName: 'Sales Operations Manager',
    userRole: 'Admin',
    actionCategory: 'INVENTORY',
    actionType: shouldLock ? 'SALES_ORDER_LOCKED' : 'SALES_ORDER_UNLOCKED',
    targetEntity: targetOrder.salesOrderNo || targetOrder.id,
    details: shouldLock
      ? `Locked Sales Order ${targetOrder.salesOrderNo || targetOrder.id} as FULFILLED and DONE.`
      : `Unlocked Sales Order ${targetOrder.salesOrderNo || targetOrder.id} for edits.`,
    severity: 'INFO'
  };
  auditLogsState.unshift(auditEntry);

  res.json({
    success: true,
    order: targetOrder,
    skus: skusState,
    batches: batchesState,
    auditLog: auditEntry
  });
});

// POST /api/orders/optimize-route - Calculate optimized picking route
app.post('/api/orders/optimize-route', (req, res) => {
  const { orderId } = req.body;
  const order = ordersState.find((o) => o.id === orderId);

  if (!order) {
    return res.status(404).json({ error: `Order ${orderId} not found.` });
  }

  const route = calculateOptimizedPickRoute(order, batchesState, locationsState);
  order.status = 'OPTIMIZED';

  res.json({ order, route });
});

// POST /api/orders/complete-pick - Mark picking order completed and deduct batch quantities
app.post('/api/orders/complete-pick', (req, res) => {
  const { orderId, pickedItems } = req.body;

  const order = ordersState.find((o) => o.id === orderId);
  if (!order) {
    return res.status(404).json({ error: `Order ${orderId} not found.` });
  }

  const timestampStr = new Date().toISOString().replace('T', ' ').slice(0, 19);

  // Process item deductions according to FEFO
  if (Array.isArray(pickedItems)) {
    pickedItems.forEach((picked) => {
      const { batchNo, qty } = picked;
      const targetBatch = batchesState.find((b) => b.batchNo === batchNo);

      if (targetBatch) {
        targetBatch.quantityOnHand = targetBatch.quantityOnHand - qty;
        targetBatch.quantityAllocated = Math.max(0, targetBatch.quantityAllocated - qty);
        targetBatch.quantityAvailable = targetBatch.quantityOnHand - targetBatch.quantityAllocated;

        // Record stock movement
        stockMovementsState.unshift({
          id: `LOG-${Date.now().toString().slice(-6)}`,
          timestamp: timestampStr,
          type: 'PICKING',
          sku: targetBatch.sku,
          itemName: targetBatch.itemName,
          batchNo: targetBatch.batchNo,
          fromLocation: targetBatch.locationId,
          toLocation: order.destinationZone,
          quantity: qty,
          operator: 'Floor Picker (Guided Route)',
          referenceDoc: order.id
        });
      }
    });
  }

  order.status = 'COMPLETED';
  order.items.forEach((item) => {
    item.isPicked = true;
    item.pickedQty = item.requestedQty;
  });

  res.json({ success: true, order });
});

// GET /api/audit-logs - Retrieve administrative audit logs
app.get('/api/audit-logs', (req, res) => {
  res.json(auditLogsState);
});

// POST /api/audit-logs - Create a new administrative audit log entry
app.post('/api/audit-logs', (req, res) => {
  const { userId, userName, userRole, actionCategory, actionType, targetEntity, details, severity, ipAddress } = req.body;

  if (!userName || !actionCategory || !actionType || !details) {
    return res.status(400).json({ error: 'Missing required audit log parameters.' });
  }

  const newAuditEntry: AuditLogEntry = {
    id: `AUD-${Date.now().toString().slice(-6)}`,
    timestamp: new Date().toISOString().replace('T', ' ').slice(0, 19),
    userId: userId || 'USR-SYS',
    userName: userName || 'System Administrator',
    userRole: userRole || 'Admin',
    actionCategory: actionCategory || 'SYSTEM',
    actionType,
    targetEntity: targetEntity || 'System',
    details,
    severity: severity || 'INFO',
    ipAddress: ipAddress || '192.168.1.10'
  };

  auditLogsState.unshift(newAuditEntry);
  res.json({ success: true, auditLog: newAuditEntry });
});

// ==========================================
// MS SQL SERVER DATABASE EMULATOR & T-SQL ROUTE
// ==========================================

// GET /api/mssql/ping - Real-time MS SQL Server Connectivity Ping
app.get('/api/mssql/ping', (req, res) => {
  const serverHost = process.env.MSSQL_SERVER || 'localhost';
  const port = process.env.MSSQL_PORT || '1433';
  const database = process.env.MSSQL_DATABASE || 'ApexWMS_Production';

  if (mssqlSimulateOffline) {
    return res.status(503).json({
      connected: false,
      status: 'disconnected',
      error: `Network Connection Timeout: Unable to reach MS SQL Server on ${serverHost}:${port}. The database engine is offline or unreachable.`,
      databaseName: database,
      serverHost,
      port,
      timestamp: new Date().toISOString()
    });
  }

  // Realistic latency response
  const latencyMs = Math.floor(Math.random() * 8) + 4;

  res.json({
    connected: true,
    status: 'connected',
    databaseName: database,
    serverVersion: 'Microsoft SQL Server 2025 (RTM-GDR) / 2022 Express',
    serverHost,
    port,
    latencyMs,
    activeConnections: 6,
    timestamp: new Date().toISOString()
  });
});

// POST /api/mssql/toggle-simulate-offline - Toggle offline simulation for QA testing
app.post('/api/mssql/toggle-simulate-offline', (req, res) => {
  mssqlSimulateOffline = !mssqlSimulateOffline;
  res.json({
    simulateOffline: mssqlSimulateOffline,
    message: mssqlSimulateOffline
      ? 'Simulated MS SQL Server disconnection activated.'
      : 'MS SQL Server connection restored to normal online state.'
  });
});

app.get('/api/mssql/schema', (req, res) => {
  res.json({
    tables: INITIAL_MSSQL_SCHEMA,
    serverVersion: 'Microsoft SQL Server 2022 (RTM) - 16.0.1000.6 (X64)',
    databaseName: 'ApexWMS_Production'
  });
});

// POST /api/mssql/query - Process T-SQL Queries
app.post('/api/mssql/query', (req, res) => {
  const { sql } = req.body;
  const startTime = Date.now();

  if (!sql || typeof sql !== 'string') {
    return res.status(400).json({ error: 'SQL query string required.' });
  }

  const normalizedSql = sql.trim();

  try {
    let columns: string[] = [];
    let rows: Record<string, any>[] = [];

    // T-SQL Query Parser & Execution against in-memory state
    if (/SELECT.*FROM dbo\.AuditLogs/i.test(normalizedSql)) {
      columns = ['AuditID', 'Timestamp', 'UserID', 'UserName', 'UserRole', 'ActionCategory', 'ActionType', 'TargetEntity', 'Details', 'Severity'];
      rows = auditLogsState.map((a) => ({
        AuditID: a.id,
        Timestamp: a.timestamp,
        UserID: a.userId,
        UserName: a.userName,
        UserRole: a.userRole,
        ActionCategory: a.actionCategory,
        ActionType: a.actionType,
        TargetEntity: a.targetEntity,
        Details: a.details,
        Severity: a.severity
      }));

      if (/WHERE.*ActionCategory.*QUARANTINE/i.test(normalizedSql)) {
        rows = rows.filter((r) => r.ActionCategory === 'QUARANTINE');
      } else if (/WHERE.*ActionCategory.*ROLE_MANAGEMENT/i.test(normalizedSql)) {
        rows = rows.filter((r) => r.ActionCategory === 'ROLE_MANAGEMENT');
      }
    } else if (/SELECT.*FROM dbo\.Batches/i.test(normalizedSql)) {
      columns = ['BatchID', 'BatchNo', 'SKU', 'ItemName', 'BestBeforeDate', 'Supplier', 'LocationID', 'QuantityOnHand', 'Status'];
      rows = batchesState.map((b) => ({
        BatchID: b.id,
        BatchNo: b.batchNo,
        SKU: b.sku,
        ItemName: b.itemName,
        BestBeforeDate: b.bestBeforeDate,
        Supplier: b.supplier,
        LocationID: b.locationId,
        QuantityOnHand: b.quantityOnHand,
        Status: b.status
      }));

      // Filter by WHERE clauses
      if (/WHERE.*Status.*QUARANTINED/i.test(normalizedSql)) {
        rows = rows.filter((r) => r.Status === 'QUARANTINED');
      } else if (/WHERE.*BestBeforeDate/i.test(normalizedSql)) {
        // Expiry filter
        rows = rows.filter((r) => new Date(r.BestBeforeDate).getTime() < new Date('2026-09-01').getTime());
      }
    } else if (/SELECT.*FROM dbo\.Inventory/i.test(normalizedSql)) {
      columns = ['SKU', 'ItemName', 'Category', 'Unit', 'ReorderPoint', 'SafetyStock', 'WeightPerUnitKg', 'StorageZone'];
      rows = skusState.map((s) => ({
        SKU: s.sku,
        ItemName: s.name,
        Category: s.category,
        Unit: s.unit,
        ReorderPoint: s.reorderPoint,
        SafetyStock: s.safetyStock,
        WeightPerUnitKg: s.weightPerUnitKg,
        StorageZone: s.storageZone
      }));
    } else if (/SELECT.*FROM dbo\.Locations/i.test(normalizedSql)) {
      columns = ['LocationID', 'Aisle', 'RackNumber', 'ShelfLevel', 'Zone', 'CapacityKg', 'CurrentKg'];
      rows = locationsState.map((l) => ({
        LocationID: l.id,
        Aisle: l.aisle,
        RackNumber: l.rack,
        ShelfLevel: l.shelf,
        Zone: l.zone,
        CapacityKg: l.capacityKg,
        CurrentKg: l.currentKg
      }));
    } else if (/SELECT.*FROM dbo\.StockMovements/i.test(normalizedSql)) {
      columns = ['MovementID', 'Timestamp', 'MovementType', 'SKU', 'ItemName', 'BatchNo', 'FromLocation', 'ToLocation', 'Quantity', 'Operator'];
      rows = stockMovementsState.map((m) => ({
        MovementID: m.id,
        Timestamp: m.timestamp,
        MovementType: m.type,
        SKU: m.sku,
        ItemName: m.itemName,
        BatchNo: m.batchNo,
        FromLocation: m.fromLocation || 'N/A',
        ToLocation: m.toLocation || 'N/A',
        Quantity: m.quantity,
        Operator: m.operator
      }));
    } else if (/JOIN|GROUP BY|FEFO/i.test(normalizedSql)) {
      // Complex FEFO Traceability Join
      columns = ['BatchNo', 'SKU', 'ItemName', 'BestBeforeDate', 'LocationID', 'Aisle', 'QuantityOnHand', 'DaysUntilExpiry', 'FEFO_Priority'];
      const now = new Date().getTime();
      rows = batchesState.map((b) => {
        const loc = locationsState.find((l) => l.id === b.locationId);
        const days = Math.ceil((new Date(b.bestBeforeDate).getTime() - now) / (1000 * 3600 * 24));
        return {
          BatchNo: b.batchNo,
          SKU: b.sku,
          ItemName: b.itemName,
          BestBeforeDate: b.bestBeforeDate,
          LocationID: b.locationId,
          Aisle: loc ? loc.aisle : 'A',
          QuantityOnHand: b.quantityOnHand,
          DaysUntilExpiry: days,
          FEFO_Priority: days <= 14 ? 'HIGH - EXPIRE SOON' : 'NORMAL'
        };
      }).sort((a, b) => a.DaysUntilExpiry - b.DaysUntilExpiry);
    } else {
      // Default fallback return query overview
      columns = ['QueryStatus', 'ServerEngine', 'ProcessedStatement'];
      rows = [
        {
          QueryStatus: 'SUCCESS',
          ServerEngine: 'MS SQL Server 2022 Express Edition (ApexWMS Cluster)',
          ProcessedStatement: normalizedSql.slice(0, 100) + '...'
        }
      ];
    }

    const executionTimeMs = Date.now() - startTime + Math.floor(Math.random() * 8 + 3);

    res.json({
      columns,
      rows,
      rowCount: rows.length,
      executionTimeMs,
      sqlQuery: normalizedSql
    });
  } catch (err: any) {
    res.status(500).json({
      error: `MS SQL Exception: ${err.message || 'Syntax error in T-SQL query'}`
    });
  }
});

// ==========================================
// GEMINI AI INTEGRATION ROUTES
// ==========================================

// POST /api/gemini/sql-assistant - NL to T-SQL Query Generator & WMS Assistant
app.post('/api/gemini/sql-assistant', async (req, res) => {
  try {
    const { userPrompt } = req.body;
    if (!userPrompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    const ai = getGenAIClient();
    if (!ai) {
      return res.status(503).json({
        error: 'Gemini API key is missing. Please configure GEMINI_API_KEY in Secrets.'
      });
    }

    const systemInstruction = `You are an expert MS SQL Server DBA and Warehouse Management System (WMS) specialist.
The MS SQL Database 'ApexWMS_Production' has the following schema:
- dbo.Inventory (SKU, ItemName, Category, Unit, ReorderPoint, SafetyStock, WeightPerUnitKg, Barcode, StorageZone)
- dbo.Batches (BatchID, BatchNo, SKU, ManufactureDate, BestBeforeDate, Supplier, LocationID, QuantityOnHand, QuantityAllocated, QuantityAvailable, Status, ReceivedAt)
- dbo.Locations (LocationID, Aisle, RackNumber, ShelfLevel, Zone, CapacityKg, CurrentKg)
- dbo.PickOrders (OrderID, CustomerName, OrderDate, RequiredDeliveryDate, Status, Priority, DestinationZone)
- dbo.StockMovements (MovementID, Timestamp, MovementType, SKU, BatchNo, FromLocation, ToLocation, Quantity, Operator, ReferenceDoc)

When asked to generate a query or report, output:
1. A clean T-SQL query block (e.g. \`\`\`sql ... \`\`\`)
2. A brief 2-sentence explanation of how this query resolves FEFO traceability, inventory status, or route optimization.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.6-flash',
      contents: userPrompt,
      config: {
        systemInstruction,
        temperature: 0.3
      }
    });

    res.json({ answer: response.text });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Gemini request failed' });
  }
});

// POST /api/gemini/inventory-insights - Smart Expiry & Route Advisory
app.post('/api/gemini/inventory-insights', async (req, res) => {
  try {
    const ai = getGenAIClient();
    if (!ai) {
      return res.status(503).json({
        error: 'Gemini API key is missing. Configure GEMINI_API_KEY in Secrets.'
      });
    }

    const summaryText = `Current WMS Inventory State:
Total SKUs: ${skusState.length}
Total Batches: ${batchesState.length}
Batches Expiring in < 30 days: ${batchesState.filter(b => {
      const days = Math.ceil((new Date(b.bestBeforeDate).getTime() - Date.now()) / (1000 * 3600 * 24));
      return days <= 30;
    }).map(b => `${b.batchNo} (${b.itemName}, BBD: ${b.bestBeforeDate}, Loc: ${b.locationId})`).join('; ')}

Quarantined Lots: ${batchesState.filter(b => b.status === 'QUARANTINED').map(b => `${b.batchNo} (${b.itemName})`).join(', ') || 'None'}
`;

    const prompt = `Analyze this warehouse inventory state and provide 3 actionable, high-impact operational recommendations for:
1. FEFO Expiry Risk & Spoilage Prevention
2. Picking Route & Location Slotting Efficiency
3. Lot Quality Control & Traceability Safeguards.

Keep the advice concise, professional, and formatted in clean bullet points with emoji headings.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.6-flash',
      contents: prompt,
      config: {
        temperature: 0.4
      }
    });

    res.json({ insights: response.text });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Gemini insight call failed' });
  }
});

// ==========================================
// VITE MIDDLEWARE & SERVER STARTUP
// ==========================================

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(
      express.static(distPath, {
        maxAge: '1d',
        etag: true,
        setHeaders: (res, filePath) => {
          if (filePath.endsWith('.html')) {
            res.setHeader('Cache-Control', 'no-cache, must-revalidate');
          } else {
            res.setHeader('Cache-Control', 'public, max-age=86400, immutable');
          }
        }
      })
    );
    app.get('*', (req, res) => {
      res.setHeader('Cache-Control', 'no-cache, must-revalidate');
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`ApexWMS Production Server running on http://0.0.0.0:${PORT}`);
  });

  const gracefulShutdown = (signal: string) => {
    console.log(`Received ${signal}. Initiating graceful shutdown...`);
    server.close(() => {
      console.log('HTTP server closed. Process exiting.');
      process.exit(0);
    });
    setTimeout(() => {
      console.error('Forceful shutdown timeout.');
      process.exit(1);
    }, 5000);
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
}

startServer();
