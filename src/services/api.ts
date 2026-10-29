import { PickOrder, MssqlQueryResult, MssqlTableSchema, AuditLogEntry, AuditCategory, PurchaseOrder, ProductSKU, CustomerProfile } from '../types/wms';
import { UserProfile, UserRole } from '../types/roles';
import { apiFetch } from './http';

export async function fetchInventory() {
  try {
    const res = await apiFetch('/api/inventory');
    if (!res.ok) throw new Error('Failed to fetch inventory');
    return await res.json();
  } catch (err) {
    console.warn('Backend server call failed:', err);
    return null;
  }
}

export async function receiveInboundStock(data: {
  sku: string;
  batchNo: string;
  manufactureDate: string;
  bestBeforeDate: string;
  supplier: string;
  locationId: string;
  quantity: number;
  unitCost?: number;
  category?: string;
}) {
  const res = await apiFetch('/api/inventory/receive', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Receiving failed');
  }
  return await res.json();
}

export async function toggleBatchQuarantine(batchNo: string, quarantineReason?: string) {
  const res = await apiFetch('/api/inventory/quarantine', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ batchNo, quarantineReason })
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Quarantine toggle failed');
  }
  return await res.json();
}

export async function outboundStock(data: {
  sku: string;
  batchNo?: string;
  quantity: number;
  outboundPurpose: string;
  remark: string;
  operator?: string;
  destination?: string;
  salesOrderId?: string;
  salesOrderItemId?: string;
  createSalesOrderRecord?: boolean;
  customerName?: string;
}) {
  const res = await apiFetch('/api/inventory/outbound', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Outbound stock deduction failed');
  }
  return await res.json();
}

export async function fetchOrders(): Promise<PickOrder[]> {
  const res = await apiFetch('/api/orders');
  if (!res.ok) throw new Error('Failed to fetch orders');
  return await res.json();
}

export async function createSalesOrder(data: {
  salesOrderNo?: string;
  poNumber?: string;
  customerName: string;
  requiredDeliveryDate?: string;
  priority?: 'NORMAL' | 'HIGH' | 'URGENT';
  destinationZone?: string;
  remark?: string;
  items: Array<{
    sku: string;
    itemName?: string;
    orderQtyCtn: number;
    allocateQty?: number;
    remark?: string;
  }>;
}) {
  const res = await apiFetch('/api/sales-orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to create sales order');
  }
  return await res.json();
}

export async function updateSalesOrderAllocation(orderId: string, data: {
  remark?: string;
  items: Array<{
    sku: string;
    id?: string;
    orderQtyCtn?: number;
    allocateQty?: number;
    fulfillmentQty?: number;
    remark?: string;
  }>;
}) {
  const res = await apiFetch(`/api/sales-orders/${encodeURIComponent(orderId)}/allocation`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to update sales order allocation');
  }
  return await res.json();
}

export async function autoAllocateSalesOrder(orderId: string) {
  const res = await apiFetch(`/api/sales-orders/${encodeURIComponent(orderId)}/auto-allocate`, {
    method: 'POST'
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Auto allocation failed');
  }
  return await res.json();
}

export async function deleteSalesOrder(orderId: string) {
  const res = await apiFetch(`/api/sales-orders/${encodeURIComponent(orderId)}`, {
    method: 'DELETE'
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to delete sales order');
  }
  return await res.json();
}

export async function lockSalesOrder(orderId: string, isLocked: boolean = true) {
  const res = await apiFetch(`/api/sales-orders/${encodeURIComponent(orderId)}/lock`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ isLocked })
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to lock/unlock sales order');
  }
  return await res.json();
}

export async function optimizePickRoute(orderId: string) {
  const res = await apiFetch('/api/orders/optimize-route', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderId })
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Route optimization failed');
  }
  return await res.json();
}

export async function completeOrderPicking(orderId: string, pickedItems: Array<{ batchNo: string; qty: number }>) {
  const res = await apiFetch('/api/orders/complete-pick', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderId, pickedItems })
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Completing order failed');
  }
  return await res.json();
}

export async function executeMssqlQuery(sql: string): Promise<MssqlQueryResult> {
  const res = await apiFetch('/api/mssql/query', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sql })
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Query execution failed');
  }
  return await res.json();
}

export interface MssqlPingStatus {
  connected: boolean;
  status: 'connected' | 'disconnected' | 'connecting';
  databaseName?: string;
  serverVersion?: string;
  serverHost?: string;
  port?: string;
  latencyMs?: number;
  activeConnections?: number;
  timestamp?: string;
  error?: string;
}

export async function pingMssqlBackend(): Promise<MssqlPingStatus> {
  const startTime = Date.now();
  try {
    const res = await apiFetch('/api/mssql/ping', {
      headers: { 'Cache-Control': 'no-cache' }
    });
    const roundTrip = Date.now() - startTime;
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return {
        connected: false,
        status: 'disconnected',
        error: err.error || `HTTP ${res.status}: SQL Server unreachable`,
        latencyMs: roundTrip,
        timestamp: new Date().toISOString()
      };
    }
    const data = await res.json();
    return {
      ...data,
      latencyMs: data.latencyMs ?? roundTrip
    };
  } catch (err: any) {
    return {
      connected: false,
      status: 'disconnected',
      error: err.message || 'Network error: cannot reach server backend',
      latencyMs: Date.now() - startTime,
      timestamp: new Date().toISOString()
    };
  }
}

export async function toggleSimulateMssqlOffline(): Promise<{ simulateOffline: boolean; message: string }> {
  const res = await apiFetch('/api/mssql/toggle-simulate-offline', {
    method: 'POST'
  });
  if (!res.ok) throw new Error('Failed to toggle simulate offline');
  return res.json();
}

export async function fetchMssqlSchema(): Promise<{ tables: MssqlTableSchema[]; serverVersion: string; databaseName: string }> {
  const res = await apiFetch('/api/mssql/schema');
  if (!res.ok) throw new Error('Failed to fetch MSSQL schema');
  return await res.json();
}

export async function askGeminiSqlAssistant(userPrompt: string): Promise<string> {
  const res = await apiFetch('/api/gemini/sql-assistant', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userPrompt })
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Gemini request failed');
  }
  const data = await res.json();
  return data.answer;
}

export async function fetchGeminiInventoryInsights(): Promise<string> {
  const res = await apiFetch('/api/gemini/inventory-insights', {
    method: 'POST'
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Gemini insights failed');
  }
  const data = await res.json();
  return data.insights;
}

export async function fetchPurchaseOrders(): Promise<PurchaseOrder[]> {
  try {
    const res = await apiFetch('/api/purchase-orders');
    if (!res.ok) throw new Error('Failed to fetch purchase orders');
    return await res.json();
  } catch (err) {
    console.warn('Backend call for purchase orders failed:', err);
    return [];
  }
}

export async function createPurchaseOrder(data: {
  sku: string;
  itemName: string;
  supplier: string;
  reorderQuantity: number;
  unitCost: number;
  expectedDeliveryDate: string;
  generatedBy: string;
  destinationLocationId?: string;
  notes?: string;
}): Promise<PurchaseOrder> {
  const res = await apiFetch('/api/purchase-orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to generate purchase order');
  }
  const result = await res.json();
  return result.purchaseOrder;
}

export async function deletePurchaseOrder(id: string): Promise<{ success: boolean; deletedId: string }> {
  const res = await apiFetch(`/api/purchase-orders/${encodeURIComponent(id)}`, {
    method: 'DELETE'
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to delete purchase order');
  }
  return await res.json();
}

export async function clearStockMovements(): Promise<{ success: boolean; clearedCount: number }> {
  const res = await apiFetch('/api/stock-movements', {
    method: 'DELETE'
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to clear stock movement log stream');
  }
  return await res.json();
}

export async function syncCatcherGourmetMatrix(): Promise<{ success: boolean; message: string; skus: ProductSKU[] }> {
  const res = await apiFetch('/api/matrix/sync', {
    method: 'POST'
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to sync Catcher Gourmet Internal Sheet Balance Matrix');
  }
  return await res.json();
}

export async function createSKU(skuData: {
  sku: string;
  name: string;
  category: string;
  description: string;
  unit: string;
  reorderPoint: number;
  safetyStock: number;
  barcode: string;
  storageZone: 'COLD_STORAGE' | 'HIGH_VELOCITY' | 'DRY' | 'HAZMAT';
}): Promise<ProductSKU> {
  const res = await apiFetch('/api/skus', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(skuData)
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to create SKU');
  }
  const result = await res.json();
  return result.sku;
}

export async function updateSKU(skuCode: string, skuData: {
  name?: string;
  category?: string;
  description?: string;
  unit?: string;
  reorderPoint?: number;
  safetyStock?: number;
  storageZone?: 'COLD_STORAGE' | 'HIGH_VELOCITY' | 'DRY' | 'HAZMAT';
}): Promise<ProductSKU> {
  const res = await apiFetch(`/api/skus/${encodeURIComponent(skuCode)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(skuData)
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to update SKU');
  }
  const result = await res.json();
  return result.sku;
}

export async function renameCategory(oldCategory: string, newCategory: string) {
  const res = await apiFetch('/api/categories/rename', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ oldCategory, newCategory })
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to rename category');
  }
  return res.json();
}

export async function deleteCategory(categoryName: string, reassignTo: string = 'General Products') {
  const res = await apiFetch('/api/categories/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ categoryName, reassignTo })
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to delete category');
  }
  return res.json();
}

export async function fetchAuditLogs(): Promise<AuditLogEntry[]> {
  try {
    const res = await apiFetch('/api/audit-logs');
    if (!res.ok) throw new Error('Failed to fetch audit logs');
    return await res.json();
  } catch (err) {
    console.warn('Backend call for audit logs failed:', err);
    return [];
  }
}

export async function createAuditLogEntry(entry: {
  userId: string;
  userName: string;
  userRole: string;
  actionCategory: AuditCategory;
  actionType: string;
  targetEntity: string;
  details: string;
  severity?: 'INFO' | 'WARNING' | 'CRITICAL';
}): Promise<AuditLogEntry | null> {
  try {
    const res = await apiFetch('/api/audit-logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry)
    });
    if (!res.ok) throw new Error('Failed to create audit log entry');
    const data = await res.json();
    return data.auditLog;
  } catch (err) {
    console.warn('Failed to post audit log to backend:', err);
    return null;
  }
}

export async function fetchUsers(): Promise<UserProfile[]> {
  try {
    const res = await apiFetch('/api/users');
    if (!res.ok) throw new Error('Failed to fetch user profiles');
    return await res.json();
  } catch (err) {
    console.warn('Failed to fetch users from backend:', err);
    return [];
  }
}

export async function createUser(userData: {
  name: string;
  email: string;
  role: UserRole;
  department?: string;
  shift?: string;
  badgeCode?: string;
  password: string;
}): Promise<UserProfile> {
  const res = await apiFetch('/api/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(userData)
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to create user profile');
  }
  const result = await res.json();
  return result.user;
}

export async function updateUserProfile(id: string, updates: Partial<UserProfile> & { password?: string }): Promise<UserProfile> {
  const res = await apiFetch(`/api/users/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates)
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to update user profile');
  }
  const result = await res.json();
  return result.user;
}

export async function deleteUser(id: string): Promise<boolean> {
  const res = await apiFetch(`/api/users/${id}`, {
    method: 'DELETE'
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to delete user profile');
  }
  return true;
}

export async function fetchCustomers(): Promise<CustomerProfile[]> {
  try {
    const res = await apiFetch('/api/customers');
    if (!res.ok) throw new Error('Failed to fetch customers');
    return await res.json();
  } catch (err) {
    console.warn('Backend fetch customers failed:', err);
    return [];
  }
}

export async function createCustomerProfile(data: {
  companyName: string;
  contactPerson?: string;
  email?: string;
  phone?: string;
  address?: string;
  customerCode?: string;
  creditLimit?: number;
  paymentTerms?: string;
  preferredZone?: string;
  notes?: string;
}): Promise<CustomerProfile> {
  const res = await apiFetch('/api/customers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to create customer profile');
  }
  const result = await res.json();
  return result.customer;
}

export async function updateCustomerProfile(id: string, updates: Partial<CustomerProfile>): Promise<CustomerProfile> {
  const res = await apiFetch(`/api/customers/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates)
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to update customer profile');
  }
  const result = await res.json();
  return result.customer;
}

export async function deleteCustomerProfile(id: string): Promise<boolean> {
  const res = await apiFetch(`/api/customers/${encodeURIComponent(id)}`, {
    method: 'DELETE'
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to delete customer profile');
  }
  return true;
}

export async function adjustStock(data: {
  sku: string;
  batchNo?: string;
  adjustmentType: 'SET_EXACT' | 'ADD' | 'SUBTRACT';
  countedQuantity: number;
  reasonCode: string;
  notes?: string;
  operator?: string;
  locationId?: string;
}) {
  const res = await apiFetch('/api/inventory/adjust', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Stock Take Adjustment failed');
  }
  return await res.json();
}

export async function importSKUsFromCSV(
  items: any[],
  operator?: string,
  mode: 'OVERWRITE' | 'SKIP_EXISTING' | 'MERGE_STOCK' = 'OVERWRITE'
) {
  const res = await apiFetch('/api/inventory/import-skus', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items, operator, mode })
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Bulk CSV SKU import failed');
  }
  return await res.json();
}

export async function importBatchesFromCSV(
  items: any[],
  operator?: string,
  mode: 'OVERWRITE' | 'SKIP_EXISTING' | 'MERGE_STOCK' = 'OVERWRITE'
) {
  const res = await apiFetch('/api/inventory/import-batches', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items, operator, mode })
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Bulk CSV Batch Lot import failed');
  }
  return await res.json();
}

export async function createLocation(data: {
  aisle: string;
  rack: number;
  shelf: number;
  bin: string;
  zone: string;
  capacityKg?: number;
}) {
  const res = await apiFetch('/api/locations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to create location');
  }
  return await res.json();
}

export async function updateLocation(id: string, updates: any) {
  const res = await apiFetch(`/api/locations/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates)
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to update location');
  }
  return await res.json();
}

export async function deleteLocation(id: string) {
  const res = await apiFetch(`/api/locations/${encodeURIComponent(id)}`, {
    method: 'DELETE'
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to delete location');
  }
  return await res.json();
}

// Facilities API helpers
export async function createFacility(data: {
  code: string;
  name: string;
  address?: string;
  managerName?: string;
  contactPhone?: string;
  status?: string;
  totalAreaSqFt?: number;
}) {
  const res = await apiFetch('/api/facilities', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to create warehouse facility');
  }
  return await res.json();
}

export async function updateFacility(id: string, updates: any) {
  const res = await apiFetch(`/api/facilities/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates)
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to update warehouse facility');
  }
  return await res.json();
}

export async function deleteFacility(id: string) {
  const res = await apiFetch(`/api/facilities/${encodeURIComponent(id)}`, {
    method: 'DELETE'
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to delete warehouse facility');
  }
  return await res.json();
}

// Storage Zones API helpers
export async function createZone(data: {
  code: string;
  title: string;
  temperatureRange?: string;
  description?: string;
  aisle?: string;
  icon?: string;
  themeColor?: string;
  facilityId?: string;
  maxCapacityKg?: number;
}) {
  const res = await apiFetch('/api/zones', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to create storage zone');
  }
  return await res.json();
}

export async function updateZone(code: string, updates: any) {
  const res = await apiFetch(`/api/zones/${encodeURIComponent(code)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates)
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to update storage zone');
  }
  return await res.json();
}

export async function deleteZone(code: string) {
  const res = await apiFetch(`/api/zones/${encodeURIComponent(code)}`, {
    method: 'DELETE'
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to delete storage zone');
  }
  return await res.json();
}


// ---------------------------------------------------------------------------
// Sign-in, password and role permissions
// ---------------------------------------------------------------------------
import type { WmsPermission } from '../types/roles';
export type RolePermissionMap = Record<UserRole, WmsPermission[]>;

async function errorText(res: Response, fallback: string): Promise<string> {
  try {
    const body = await res.json();
    return body.error || fallback;
  } catch {
    return fallback;
  }
}

/** Is the service reachable at this address? (does not need a login) */
export async function checkServer(): Promise<boolean> {
  try {
    const res = await apiFetch('/api/health');
    return res.ok;
  } catch {
    return false;
  }
}

export async function loginRequest(email: string, password: string): Promise<{ token: string; user: UserProfile; rolePermissions: RolePermissionMap }> {
  let res: Response;
  try {
    res = await apiFetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
  } catch {
    throw new Error('Cannot reach the ApexWMS service. Check the server address and that the service is running.');
  }
  if (!res.ok) throw new Error(await errorText(res, 'Sign in failed.'));
  return res.json();
}

export async function fetchMe(): Promise<{ user: UserProfile; rolePermissions: RolePermissionMap } | null> {
  try {
    const res = await apiFetch('/api/auth/me');
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function changeMyPassword(currentPassword: string, newPassword: string): Promise<void> {
  const res = await apiFetch('/api/auth/change-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ currentPassword, newPassword })
  });
  if (!res.ok) throw new Error(await errorText(res, 'Could not change the password.'));
}

export interface WarehouseSettings {
  allowNegativeStock: boolean;
}

export async function fetchSettings(): Promise<WarehouseSettings> {
  const res = await apiFetch('/api/settings');
  if (!res.ok) throw new Error(await errorText(res, 'Could not load settings.'));
  return res.json();
}

export async function saveSettings(settings: WarehouseSettings): Promise<WarehouseSettings> {
  const res = await apiFetch('/api/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings)
  });
  if (!res.ok) throw new Error(await errorText(res, 'Could not save settings.'));
  return res.json();
}

export async function saveRolePermissions(map: RolePermissionMap): Promise<RolePermissionMap> {
  const res = await apiFetch('/api/role-permissions', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(map)
  });
  if (!res.ok) throw new Error(await errorText(res, 'Could not save role permissions.'));
  return res.json();
}
