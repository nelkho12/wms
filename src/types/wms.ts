export * from './roles';

export type ZoneType = 'DRY' | 'COLD_STORAGE' | 'HAZMAT' | 'HIGH_VELOCITY' | 'STAGING' | string;

export type StockStatus = 'AVAILABLE' | 'RESERVED' | 'QUARANTINED' | 'EXPIRED' | 'LOW_STOCK';

export interface WarehouseFacility {
  id: string; // e.g. FAC-01
  code: string; // e.g. MDC-01
  name: string; // e.g. Main Distribution Center
  address: string;
  managerName: string;
  contactPhone: string;
  status: 'ACTIVE' | 'MAINTENANCE' | 'INACTIVE';
  totalAreaSqFt: number;
}

export interface StorageZone {
  code: string; // e.g. COLD_STORAGE, HIGH_VELOCITY, DRY, HAZMAT, STAGING, or custom
  title: string; // e.g. Cold Storage (Aisle A)
  temperatureRange: string; // e.g. 2°C to 8°C Refrigerated
  description: string; // e.g. Dairy, fresh pastes, fruit concentrates
  aisle: string; // e.g. Aisle A
  icon: string; // e.g. 🧊, ⚡, 📦, 🔒, 🚚
  themeColor: 'blue' | 'purple' | 'emerald' | 'amber' | 'slate' | 'rose' | 'indigo';
  facilityId?: string; // e.g. FAC-01
  maxCapacityKg?: number;
}

export interface Location {
  id: string; // e.g. A-01-02-B
  aisle: string; // e.g. A
  rack: number; // 1-10
  shelf: number; // 1-4
  bin: string; // A, B, C
  zone: ZoneType;
  gridX: number; // For 2D canvas map
  gridY: number; // For 2D canvas map
  capacityKg: number;
  currentKg: number;
  facilityId?: string;
}

export interface Batch {
  id: string; // Lot ID e.g. LOT-2026-0801-A
  batchNo: string; // e.g. B2608-4091
  sku: string; // Item SKU e.g. SKU-1001
  itemName: string;
  manufactureDate: string; // YYYY-MM-DD
  bestBeforeDate: string; // YYYY-MM-DD (BBD / Expiry)
  supplier: string;
  locationId: string;
  quantityOnHand: number;
  quantityAllocated: number;
  quantityAvailable: number;
  unitCost: number;
  status: 'ACTIVE' | 'QUARANTINED' | 'RECALLED' | 'EXPIRED';
  receivedAt: string;
  category?: string;
  notes?: string;
}

export interface ProductSKU {
  sku: string;
  name: string;
  category: string;
  unit: string; // e.g., Box, Pallet, Carton, Kg, Bottle, Pcs
  reorderPoint: number;
  safetyStock: number;
  minStockLevel?: number;
  reorderQuantity?: number;
  weightPerUnitKg: number;
  barcode: string;
  storageZone: ZoneType;
  imageUrl?: string;
  description: string;
  unitCost?: number;
  stockIn?: number;
  stockOut?: number;
  reserved?: number;
  currentQty?: number;
  exactQty?: number;
  initialBalance?: number;
  balanceForward?: number;
  monthlyBalances?: {
    JAN?: number;
    FEB?: number;
    MAR?: number;
    APR?: number;
    MAY?: number;
    JUN?: number;
    JUL?: number;
    AUG?: number;
    SEP?: number;
    OCT?: number;
    NOV?: number;
    DEC?: number;
  };
}

export interface PurchaseOrder {
  id: string; // e.g. PO-2026-8910
  createdAt: string;
  sku: string;
  itemName: string;
  supplier: string;
  category?: string;
  reorderQuantity: number;
  unitCost: number;
  totalCost: number;
  expectedDeliveryDate: string;
  status: 'ISSUED' | 'CONFIRMED' | 'FULFILLED' | 'CANCELLED';
  generatedBy: string;
  destinationLocationId?: string;
  notes?: string;
}

export interface OrderItem {
  id: string;
  sku: string;
  itemName: string;
  requestedQty: number;
  allocatedBatchNo?: string;
  allocatedLocationId?: string;
  pickedQty: number;
  isPicked: boolean;
  bestBeforeDate?: string;
  orderQtyCtn?: number;
  allocateQty?: number;
  fulfillmentQty?: number;
  outstandingQty?: number;
  remark?: string;
}

export interface PickOrder {
  id: string; // e.g., ORD-9402 or SO-2026-0810
  salesOrderNo?: string;
  poNumber?: string;
  customerName: string;
  orderDate: string;
  requiredDeliveryDate: string;
  status: 'PENDING' | 'OPTIMIZED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'DONE';
  priority: 'NORMAL' | 'HIGH' | 'URGENT';
  items: OrderItem[];
  destinationZone: string; // e.g., Outbound Bay 1
  assignedPicker?: string;
  fulfillmentStatus?: 'FULFILLED' | 'PARTIAL' | 'OUTSTANDING' | 'DONE';
  totalOrderCtn?: number;
  totalAllocatedCtn?: number;
  totalFulfilledCtn?: number;
  totalOutstandingCtn?: number;
  remark?: string;
  isLocked?: boolean;
  lockedAt?: string;
  lockedBy?: string;
}

export interface RouteNode {
  step: number;
  locationId: string;
  aisle: string;
  gridX: number;
  gridY: number;
  sku: string;
  itemName: string;
  batchNo: string;
  bestBeforeDate: string;
  pickQty: number;
  instruction: string;
  fefoReason?: string;
}

export interface PickRoute {
  orderId: string;
  totalDistanceMeters: number;
  estimatedTimeMinutes: number;
  savedDistancePercent: number;
  nodes: RouteNode[];
  pathCoordinates: Array<[number, number]>;
}

export interface StockMovement {
  id: string;
  timestamp: string;
  type: 'INBOUND_RECEIVE' | 'PUTAWAY' | 'PICKING' | 'TRANSFER' | 'ADJUSTMENT' | 'QUARANTINE_HOLD' | 'DISPATCH';
  sku: string;
  itemName: string;
  batchNo: string;
  fromLocation?: string;
  toLocation?: string;
  quantity: number;
  operator: string;
  referenceDoc?: string;
}

export interface MssqlQueryResult {
  columns: string[];
  rows: Record<string, any>[];
  rowCount: number;
  executionTimeMs: number;
  sqlQuery: string;
  error?: string;
}

export interface CustomerProfile {
  id: string;
  customerCode: string;
  companyName: string;
  contactPerson: string;
  email: string;
  phone: string;
  address: string;
  creditLimit?: number;
  paymentTerms?: string;
  preferredZone?: string;
  status: 'ACTIVE' | 'INACTIVE';
  notes?: string;
}

export interface MssqlTableSchema {
  tableName: string;
  columns: Array<{
    name: string;
    type: string;
    nullable: boolean;
    isPrimaryKey?: boolean;
    isForeignKey?: boolean;
  }>;
  rowCount: number;
}
