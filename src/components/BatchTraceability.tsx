import React, { useState } from 'react';
import {
  History,
  Search,
  ShieldAlert,
  Truck,
  MapPin,
  FileText,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  Building2,
  Package,
  Layers,
  ArrowRight,
  Lock
} from 'lucide-react';
import { Batch, ProductSKU, StockMovement, PickOrder } from '../types/wms';
import { UserProfile, UserRole, WmsPermission, hasPermission } from '../types/roles';
import { toggleBatchQuarantine } from '../services/api';

interface BatchTraceabilityProps {
  batches: Batch[];
  skus: ProductSKU[];
  orders: PickOrder[];
  stockMovements: StockMovement[];
  currentUser: UserProfile;
  onRefresh: () => void;
  onOpenRoleModal?: () => void;
  customRolePermissions?: Record<UserRole, WmsPermission[]>;
}

export const BatchTraceability: React.FC<BatchTraceabilityProps> = ({
  batches,
  skus,
  orders,
  stockMovements,
  currentUser,
  onRefresh,
  onOpenRoleModal,
  customRolePermissions
}) => {
  const [selectedBatchNo, setSelectedBatchNo] = useState<string>(batches[0]?.batchNo || '');
  const [quarantineReasonInput, setQuarantineReasonInput] = useState('');
  const [showQuarantineModal, setShowQuarantineModal] = useState(false);
  const [permissionWarning, setPermissionWarning] = useState<string | null>(null);

  const canManageQuarantine = hasPermission(currentUser.role, 'quarantine:manage', customRolePermissions);

  const activeBatch = batches.find((b) => b.batchNo === selectedBatchNo) || batches[0];
  const activeSku = skus.find((s) => s.sku === activeBatch?.sku);

  // Lineage Movements for selected batch
  const batchLogs = stockMovements.filter((m) => m.batchNo === selectedBatchNo);

  // Orders that picked or allocated this batch
  const associatedOrders = orders.filter((order) =>
    order.items.some((item) => item.allocatedBatchNo === selectedBatchNo || item.sku === activeBatch?.sku)
  );

  const handleOpenQuarantineModal = () => {
    if (!canManageQuarantine) {
      setPermissionWarning(`Role Security Guard: Active role '${currentUser.role}' lacks 'quarantine:manage' permission. Only Warehouse Manager or Admin can trigger batch recalls or release quarantines.`);
      return;
    }
    setPermissionWarning(null);
    setShowQuarantineModal(true);
  };

  const handleApplyQuarantine = async () => {
    if (!activeBatch || !canManageQuarantine) return;
    try {
      await toggleBatchQuarantine(activeBatch.batchNo, quarantineReasonInput || 'Emergency Safety Recall');
      setShowQuarantineModal(false);
      setQuarantineReasonInput('');
      onRefresh();
    } catch (err: any) {
      alert(`Quarantine failed: ${err.message}`);
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Permission Warning Banner if restricted */}
      {permissionWarning && (
        <div className="bg-rose-50 border border-rose-300 p-4 rounded-xl text-xs text-rose-900 flex items-center justify-between shadow-md">
          <div className="flex items-center space-x-2">
            <Lock className="w-5 h-5 text-rose-600 flex-shrink-0" />
            <span>{permissionWarning}</span>
          </div>
          {onOpenRoleModal && (
            <button
              onClick={onOpenRoleModal}
              className="px-3 py-1 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-lg text-xs cursor-pointer ml-3 flex-shrink-0"
            >
              Switch Role
            </button>
          )}
        </div>
      )}

      {/* Header Banner */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2 text-blue-600 font-bold text-xs uppercase tracking-wider mb-1">
            <History className="w-4 h-4" />
            <span>Full-Chain Lot Genealogy & Recall Engine</span>
          </div>
          <h2 className="text-2xl font-black text-slate-900">
            Batch & Best Before Date (BBD) Traceability
          </h2>
          <p className="text-sm text-slate-600 mt-1 max-w-2xl">
            Track backward to supplier origins and forward to customer dispatch. Execute instant lot quarantine holds in case of quality incidents.
          </p>
        </div>

        {/* Quick Search Dropdown */}
        <div className="flex items-center space-x-2 bg-slate-50 p-2 rounded-xl border border-slate-300">
          <Search className="w-4 h-4 text-slate-400 ml-2" />
          <select
            value={selectedBatchNo}
            onChange={(e) => setSelectedBatchNo(e.target.value)}
            className="bg-transparent text-sm text-slate-900 font-mono font-bold focus:outline-none pr-4"
          >
            {batches.map((b) => (
              <option key={b.id} value={b.batchNo} className="bg-white text-slate-900">
                Batch: {b.batchNo} ({b.itemName.slice(0, 20)}...)
              </option>
            ))}
          </select>
        </div>
      </div>

      {activeBatch && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Left Column: Lot Master Specs */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4 shadow-xs">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <span className="text-xs font-mono font-bold text-blue-600 uppercase">Lot Master Card</span>
              <span
                className={`px-2.5 py-0.5 rounded text-xs font-bold font-mono ${
                  activeBatch.status === 'QUARANTINED'
                    ? 'bg-rose-100 text-rose-800 border border-rose-300'
                    : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                }`}
              >
                {activeBatch.status}
              </span>
            </div>

            <div>
              <h3 className="text-xl font-bold text-slate-900">{activeBatch.itemName}</h3>
              <p className="text-xs text-slate-500 font-mono mt-0.5">SKU: {activeBatch.sku}</p>
            </div>

            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-2 text-xs font-mono">
              <div className="flex justify-between">
                <span className="text-slate-500">Batch / Lot No:</span>
                <span className="text-blue-700 font-bold">{activeBatch.batchNo}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Manufacture Date:</span>
                <span className="text-slate-900 font-medium">{activeBatch.manufactureDate}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Best Before Date (BBD):</span>
                <span className="text-amber-700 font-bold">{activeBatch.bestBeforeDate}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Current Storage Bin:</span>
                <span className="text-emerald-700 font-bold">📍 {activeBatch.locationId}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Quantity On-Hand:</span>
                <span className="text-slate-900 font-bold">{activeBatch.quantityOnHand} units</span>
              </div>
            </div>

            <div>
              <p className="text-xs text-slate-500 mb-1">Supplier Origin:</p>
              <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200 flex items-center space-x-2 text-xs text-slate-800">
                <Building2 className="w-4 h-4 text-blue-600" />
                <span className="font-semibold">{activeBatch.supplier}</span>
              </div>
            </div>

            {/* Quarantine Button */}
            <button
              onClick={handleOpenQuarantineModal}
              className={`w-full py-2.5 rounded-lg text-xs font-bold flex items-center justify-center space-x-2 transition-all cursor-pointer ${
                activeBatch.status === 'QUARANTINED'
                  ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                  : 'bg-rose-600 hover:bg-rose-500 text-white shadow-sm'
              }`}
            >
              <ShieldAlert className="w-4 h-4" />
              <span>
                {activeBatch.status === 'QUARANTINED' ? 'Release Batch Quarantine' : 'Trigger Batch Recall / Hold'}
              </span>
            </button>
          </div>

          {/* Right 2 Columns: Full Lineage Timeline (Backward -> In-Store -> Forward) */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* Visual Lineage Flow */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
              <h4 className="font-bold text-slate-900 text-base mb-4 flex items-center space-x-2">
                <Layers className="w-5 h-5 text-blue-600" />
                <span>360° End-to-End Lot Lineage</span>
              </h4>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                
                {/* Stage 1: Inbound */}
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl relative space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold text-blue-600">
                    <span className="flex items-center"><Truck className="w-3.5 h-3.5 mr-1" /> 1. Inbound</span>
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  </div>
                  <div className="text-sm font-bold text-slate-900">{activeBatch.supplier}</div>
                  <p className="text-xs text-slate-500">Received at dock: {activeBatch.receivedAt}</p>
                  <p className="text-xs font-mono text-slate-500">PO Ref: PO-INBOUND-904</p>
                </div>

                {/* Stage 2: Warehouse Bin Storage */}
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl relative space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold text-emerald-600">
                    <span className="flex items-center"><MapPin className="w-3.5 h-3.5 mr-1" /> 2. Bin Storage</span>
                    <span className="text-xs text-slate-500">Active</span>
                  </div>
                  <div className="text-sm font-bold text-slate-900">Bin {activeBatch.locationId}</div>
                  <p className="text-xs text-slate-500">{activeBatch.quantityOnHand} units on hand</p>
                  <p className="text-xs font-mono text-amber-700 font-bold">BBD: {activeBatch.bestBeforeDate}</p>
                </div>

                {/* Stage 3: Outbound Dispatch */}
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl relative space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold text-indigo-600">
                    <span className="flex items-center"><Package className="w-3.5 h-3.5 mr-1" /> 3. Dispatch</span>
                    <span className="text-xs text-slate-500">{associatedOrders.length} Orders</span>
                  </div>
                  <div className="text-sm font-bold text-slate-900">Customer Orders</div>
                  <p className="text-xs text-slate-500">
                    {associatedOrders.length > 0
                      ? associatedOrders.map((o) => o.customerName).join(', ')
                      : 'No outbound orders dispatched yet'}
                  </p>
                </div>

              </div>
            </div>

            {/* Audit Logs Table for this Batch */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
              <h4 className="font-bold text-slate-900 text-sm mb-3 flex items-center space-x-2">
                <FileText className="w-4 h-4 text-blue-600" />
                <span>Audit Trail & Stock Movement History</span>
              </h4>

              <div className="space-y-2">
                {batchLogs.length === 0 ? (
                  <p className="text-xs text-slate-400 py-4 text-center">Initial receipt log recorded at inbound creation.</p>
                ) : (
                  batchLogs.map((log) => (
                    <div
                      key={log.id}
                      className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs flex items-center justify-between"
                    >
                      <div>
                        <span className="font-mono font-bold text-blue-700 mr-2">[{log.type}]</span>
                        <span className="text-slate-900 font-semibold">{log.quantity} units</span>
                        <span className="text-slate-500 ml-2">({log.fromLocation || 'Dock'} → {log.toLocation || 'Storage'})</span>
                      </div>
                      <div className="text-slate-500 font-mono text-[11px]">
                        {log.timestamp} | {log.operator}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

          </div>

        </div>
      )}

      {/* Emergency Quarantine Modal */}
      {showQuarantineModal && activeBatch && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-rose-300 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 text-slate-900">
            <div className="flex items-center space-x-3">
              <div className="p-3 bg-rose-100 rounded-xl text-rose-700 border border-rose-200">
                <ShieldAlert className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-lg">
                  {activeBatch.status === 'QUARANTINED' ? 'Release Batch Quarantine' : 'Trigger Batch Recall / Hold'}
                </h3>
                <p className="text-xs text-slate-500">Batch: {activeBatch.batchNo}</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              {activeBatch.status === 'QUARANTINED'
                ? 'Releasing this batch will restore available stock for order picking.'
                : 'Quarantining this batch will lock all available quantities across all warehouse bins, preventing any picking routes from assigning this lot.'}
            </p>

            {activeBatch.status !== 'QUARANTINED' && (
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Reason for Recall / Hold</label>
                <input
                  type="text"
                  placeholder="e.g., Packaging tear, temperature breach, supplier recall notice"
                  value={quarantineReasonInput}
                  onChange={(e) => setQuarantineReasonInput(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2.5 text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-rose-500"
                />
              </div>
            )}

            <div className="flex justify-end space-x-2 pt-2">
              <button
                onClick={() => setShowQuarantineModal(false)}
                className="px-4 py-2 bg-slate-100 text-slate-700 hover:bg-slate-200 text-xs font-semibold rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleApplyQuarantine}
                className={`px-5 py-2 text-xs font-semibold rounded-lg text-white shadow-xs ${
                  activeBatch.status === 'QUARANTINED' ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-rose-600 hover:bg-rose-500'
                }`}
              >
                Confirm Action
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
