import React, { useState, useMemo } from 'react';
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
  Lock,
  Clock,
  Filter,
  AlertOctagon,
  Download,
  RotateCcw,
  Sparkles,
  ExternalLink,
  DollarSign,
  ChevronRight,
  ArrowUpDown
} from 'lucide-react';
import { Batch, ProductSKU, StockMovement, PickOrder } from '../types/wms';
import { UserProfile, UserRole, WmsPermission, hasPermission } from '../types/roles';
import { toggleBatchQuarantine } from '../services/api';

export type ExpiryRangeFilter = 'ALL' | 'PAST_DUE' | 'NEXT_30_DAYS' | 'DAYS_31_60' | 'DAYS_61_90' | 'DAYS_90_PLUS';

export interface BatchTraceabilityProps {
  batches: Batch[];
  skus: ProductSKU[];
  orders: PickOrder[];
  stockMovements: StockMovement[];
  currentUser: UserProfile;
  onRefresh: () => void;
  onOpenRoleModal?: () => void;
  customRolePermissions?: Record<UserRole, WmsPermission[]>;
}

export const getDaysToExpiry = (bestBeforeDate: string): number => {
  if (!bestBeforeDate) return 999;
  const now = new Date();
  const bbd = new Date(bestBeforeDate);
  return Math.ceil((bbd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
};

export const getExpiryStatusInfo = (bestBeforeDate: string, status?: string) => {
  const days = getDaysToExpiry(bestBeforeDate);
  const isExpired = status === 'EXPIRED' || days <= 0;

  if (isExpired) {
    const daysAgo = Math.abs(days);
    return {
      category: 'PAST_DUE' as const,
      label: daysAgo === 0 ? 'Expires Today' : `Expired ${daysAgo}d ago`,
      badgeClass: 'bg-rose-100 text-rose-800 border-rose-300',
      pillClass: 'bg-rose-50 text-rose-700 border-rose-300',
      icon: AlertOctagon,
      urgency: 'HIGH',
      textColor: 'text-rose-600'
    };
  }

  if (days <= 30) {
    return {
      category: 'NEXT_30_DAYS' as const,
      label: `${days}d left (Urgent FEFO)`,
      badgeClass: 'bg-orange-100 text-orange-800 border-orange-300',
      pillClass: 'bg-orange-50 text-orange-700 border-orange-300',
      icon: AlertTriangle,
      urgency: 'ELEVATED',
      textColor: 'text-orange-600'
    };
  }

  if (days <= 60) {
    return {
      category: 'DAYS_31_60' as const,
      label: `${days}d left (Warning)`,
      badgeClass: 'bg-amber-100 text-amber-800 border-amber-300',
      pillClass: 'bg-amber-50 text-amber-700 border-amber-300',
      icon: Clock,
      urgency: 'MODERATE',
      textColor: 'text-amber-600'
    };
  }

  if (days <= 90) {
    return {
      category: 'DAYS_61_90' as const,
      label: `${days}d left (Watch)`,
      badgeClass: 'bg-blue-100 text-blue-800 border-blue-300',
      pillClass: 'bg-blue-50 text-blue-700 border-blue-300',
      icon: Calendar,
      urgency: 'LOW',
      textColor: 'text-blue-600'
    };
  }

  return {
    category: 'DAYS_90_PLUS' as const,
    label: `${days}d left (Safe)`,
    badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-300',
    pillClass: 'bg-emerald-50 text-emerald-700 border-emerald-300',
    icon: CheckCircle2,
    urgency: 'NONE',
    textColor: 'text-emerald-600'
  };
};

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
  const [expiryFilter, setExpiryFilter] = useState<ExpiryRangeFilter>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'QUARANTINED'>('ALL');
  const [sortField, setSortField] = useState<'expiry' | 'batchNo' | 'qty' | 'itemName'>('expiry');
  const [sortAsc, setSortAsc] = useState<boolean>(true);
  const [quarantineReasonInput, setQuarantineReasonInput] = useState('');
  const [showQuarantineModal, setShowQuarantineModal] = useState(false);
  const [targetQuarantineBatch, setTargetQuarantineBatch] = useState<Batch | null>(null);
  const [permissionWarning, setPermissionWarning] = useState<string | null>(null);

  const canManageQuarantine = hasPermission(currentUser.role, 'quarantine:manage', customRolePermissions);

  // Compute expiry counts and at-risk metrics
  const { counts, totalAtRiskValue, pastDueCount, pastDueValue, next30Count, next30Value, safeCount } = useMemo(() => {
    const c: Record<ExpiryRangeFilter, number> = {
      ALL: batches.length,
      PAST_DUE: 0,
      NEXT_30_DAYS: 0,
      DAYS_31_60: 0,
      DAYS_61_90: 0,
      DAYS_90_PLUS: 0
    };

    let pdVal = 0;
    let n30Val = 0;
    let totalRiskVal = 0;
    let pdCount = 0;
    let n30C = 0;
    let safeC = 0;

    batches.forEach((b) => {
      const days = getDaysToExpiry(b.bestBeforeDate);
      const isExpired = b.status === 'EXPIRED' || days <= 0;
      const val = Math.max(0, b.quantityOnHand) * (b.unitCost || 0);

      if (isExpired) {
        c.PAST_DUE++;
        pdCount++;
        pdVal += val;
        totalRiskVal += val;
      } else if (days <= 30) {
        c.NEXT_30_DAYS++;
        n30C++;
        n30Val += val;
        totalRiskVal += val;
      } else if (days <= 60) {
        c.DAYS_31_60++;
      } else if (days <= 90) {
        c.DAYS_61_90++;
      } else {
        c.DAYS_90_PLUS++;
        safeC++;
      }
    });

    return {
      counts: c,
      totalAtRiskValue: totalRiskVal,
      pastDueCount: pdCount,
      pastDueValue: pdVal,
      next30Count: n30C,
      next30Value: n30Val,
      safeCount: safeC
    };
  }, [batches]);

  // Filter batches based on expiry filter, status filter, and search query
  const filteredBatches = useMemo(() => {
    return batches.filter((b) => {
      // Expiry range filter
      if (expiryFilter !== 'ALL') {
        const days = getDaysToExpiry(b.bestBeforeDate);
        const isExpired = b.status === 'EXPIRED' || days <= 0;

        if (expiryFilter === 'PAST_DUE' && !isExpired) return false;
        if (expiryFilter === 'NEXT_30_DAYS' && (isExpired || days < 1 || days > 30)) return false;
        if (expiryFilter === 'DAYS_31_60' && (isExpired || days < 31 || days > 60)) return false;
        if (expiryFilter === 'DAYS_61_90' && (isExpired || days < 61 || days > 90)) return false;
        if (expiryFilter === 'DAYS_90_PLUS' && (isExpired || days <= 90)) return false;
      }

      // Status filter
      if (statusFilter !== 'ALL' && b.status !== statusFilter) {
        return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchBatch = b.batchNo.toLowerCase().includes(q);
        const matchItem = b.itemName.toLowerCase().includes(q);
        const matchSku = b.sku.toLowerCase().includes(q);
        const matchSupplier = (b.supplier || '').toLowerCase().includes(q);
        const matchBin = (b.locationId || '').toLowerCase().includes(q);
        if (!matchBatch && !matchItem && !matchSku && !matchSupplier && !matchBin) {
          return false;
        }
      }

      return true;
    }).sort((a, b) => {
      if (sortField === 'expiry') {
        const daysA = getDaysToExpiry(a.bestBeforeDate);
        const daysB = getDaysToExpiry(b.bestBeforeDate);
        return sortAsc ? daysA - daysB : daysB - daysA;
      }
      if (sortField === 'batchNo') {
        return sortAsc ? a.batchNo.localeCompare(b.batchNo) : b.batchNo.localeCompare(a.batchNo);
      }
      if (sortField === 'itemName') {
        return sortAsc ? a.itemName.localeCompare(b.itemName) : b.itemName.localeCompare(a.itemName);
      }
      if (sortField === 'qty') {
        return sortAsc ? a.quantityOnHand - b.quantityOnHand : b.quantityOnHand - a.quantityOnHand;
      }
      return 0;
    });
  }, [batches, expiryFilter, statusFilter, searchQuery, sortField, sortAsc]);

  // Current selected batch
  const activeBatch = batches.find((b) => b.batchNo === selectedBatchNo) || filteredBatches[0] || batches[0];
  const activeSku = skus.find((s) => s.sku === activeBatch?.sku);

  // Lineage Movements for selected batch
  const batchLogs = stockMovements.filter((m) => m.batchNo === activeBatch?.batchNo);

  // Orders that picked or allocated this batch
  const associatedOrders = orders.filter((order) =>
    order.items.some((item) => item.allocatedBatchNo === activeBatch?.batchNo || item.sku === activeBatch?.sku)
  );

  const activeBatchExpiryInfo = activeBatch ? getExpiryStatusInfo(activeBatch.bestBeforeDate, activeBatch.status) : null;

  const handleOpenQuarantineModal = (batchToQuarantine?: Batch) => {
    if (!canManageQuarantine) {
      setPermissionWarning(
        `Role Security Guard: Active role '${currentUser.role}' lacks 'quarantine:manage' permission. Only Warehouse Manager or Admin can trigger batch recalls or release quarantines.`
      );
      return;
    }
    setPermissionWarning(null);
    setTargetQuarantineBatch(batchToQuarantine || activeBatch);
    setShowQuarantineModal(true);
  };

  const handleApplyQuarantine = async () => {
    const batchToAct = targetQuarantineBatch || activeBatch;
    if (!batchToAct || !canManageQuarantine) return;
    try {
      await toggleBatchQuarantine(batchToAct.batchNo, quarantineReasonInput || 'Quality/Expiry Safety Quarantine Hold');
      setShowQuarantineModal(false);
      setQuarantineReasonInput('');
      setTargetQuarantineBatch(null);
      onRefresh();
    } catch (err: any) {
      alert(`Quarantine action failed: ${err.message}`);
    }
  };

  const handleExportFilteredBatchesCSV = () => {
    if (filteredBatches.length === 0) return;
    const headers = ['Batch No', 'SKU', 'Item Name', 'BBD (Expiry)', 'Days Remaining', 'Status', 'Location Bin', 'On-Hand Qty', 'Unit Cost', 'Inventory Value', 'Supplier'];
    const rows = filteredBatches.map((b) => {
      const days = getDaysToExpiry(b.bestBeforeDate);
      const val = (b.quantityOnHand * (b.unitCost || 0)).toFixed(2);
      return [
        `"${b.batchNo}"`,
        `"${b.sku}"`,
        `"${b.itemName.replace(/"/g, '""')}"`,
        `"${b.bestBeforeDate}"`,
        days,
        `"${b.status}"`,
        `"${b.locationId}"`,
        b.quantityOnHand,
        (b.unitCost || 0).toFixed(2),
        val,
        `"${(b.supplier || '').replace(/"/g, '""')}"`
      ].join(',');
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Batch_Traceability_Expiry_Report_${expiryFilter}_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const filterButtons: Array<{
    id: ExpiryRangeFilter;
    label: string;
    sublabel: string;
    count: number;
    icon: React.ComponentType<{ className?: string }>;
    accentClass: string;
    badgeBg: string;
  }> = [
    {
      id: 'ALL',
      label: 'All Batches',
      sublabel: 'Full Inventory',
      count: counts.ALL,
      icon: Layers,
      accentClass: 'hover:border-slate-400 text-slate-700',
      badgeBg: 'bg-slate-100 text-slate-700 border-slate-300'
    },
    {
      id: 'PAST_DUE',
      label: 'Past Due',
      sublabel: 'Expired (≤0d)',
      count: counts.PAST_DUE,
      icon: AlertOctagon,
      accentClass: 'hover:border-rose-400 text-rose-700',
      badgeBg: 'bg-rose-100 text-rose-800 border-rose-300 font-bold'
    },
    {
      id: 'NEXT_30_DAYS',
      label: 'Next 30 Days',
      sublabel: 'Urgent FEFO (1–30d)',
      count: counts.NEXT_30_DAYS,
      icon: AlertTriangle,
      accentClass: 'hover:border-orange-400 text-orange-700',
      badgeBg: 'bg-orange-100 text-orange-800 border-orange-300 font-bold'
    },
    {
      id: 'DAYS_31_60',
      label: '31 – 60 Days',
      sublabel: 'Warning Watch',
      count: counts.DAYS_31_60,
      icon: Clock,
      accentClass: 'hover:border-amber-400 text-amber-700',
      badgeBg: 'bg-amber-100 text-amber-800 border-amber-300'
    },
    {
      id: 'DAYS_61_90',
      label: '61 – 90 Days',
      sublabel: 'Medium Horizon',
      count: counts.DAYS_61_90,
      icon: Calendar,
      accentClass: 'hover:border-blue-400 text-blue-700',
      badgeBg: 'bg-blue-100 text-blue-800 border-blue-300'
    },
    {
      id: 'DAYS_90_PLUS',
      label: '90+ Days',
      sublabel: 'Safe Shelf Life',
      count: counts.DAYS_90_PLUS,
      icon: CheckCircle2,
      accentClass: 'hover:border-emerald-400 text-emerald-700',
      badgeBg: 'bg-emerald-100 text-emerald-800 border-emerald-300'
    }
  ];

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
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2 text-blue-600 font-bold text-xs uppercase tracking-wider mb-1">
            <History className="w-4 h-4" />
            <span>Full-Chain Lot Genealogy & Recall Engine</span>
          </div>
          <h2 className="text-2xl font-black text-slate-900">
            Batch & Best Before Date (BBD) Traceability
          </h2>
          <p className="text-sm text-slate-600 mt-1 max-w-2xl">
            Track backward to supplier origins and forward to customer dispatch. Use interactive expiry filters to isolate at-risk stock items and execute instant quality holds.
          </p>
        </div>

        {/* Quick Batch Selector */}
        <div className="flex items-center space-x-2 bg-slate-50 p-2 rounded-xl border border-slate-300 shrink-0">
          <Search className="w-4 h-4 text-slate-400 ml-2" />
          <select
            value={activeBatch?.batchNo || ''}
            onChange={(e) => setSelectedBatchNo(e.target.value)}
            className="bg-transparent text-sm text-slate-900 font-mono font-bold focus:outline-none pr-4 max-w-xs truncate"
          >
            {batches.map((b) => {
              const days = getDaysToExpiry(b.bestBeforeDate);
              const tag = days <= 0 ? ' [EXPIRED]' : days <= 30 ? ` [${days}d left]` : '';
              return (
                <option key={b.id} value={b.batchNo} className="bg-white text-slate-900">
                  {b.batchNo} - {b.itemName.slice(0, 22)}{tag}
                </option>
              );
            })}
          </select>
        </div>
      </div>

      {/* KPI At-Risk Overview Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider">Total Lots</span>
            <Package className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-2xl font-black text-slate-900">{batches.length}</div>
          <div className="text-xs text-slate-500 mt-1 flex items-center justify-between">
            <span>On-hand stock:</span>
            <span className="font-semibold text-slate-700">
              {batches.reduce((sum, b) => sum + (b.quantityOnHand || 0), 0).toLocaleString()} units
            </span>
          </div>
        </div>

        <div className="bg-white border border-rose-200 rounded-xl p-4 shadow-xs bg-gradient-to-br from-rose-50/50 to-white">
          <div className="flex items-center justify-between text-rose-600 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider flex items-center">
              <AlertOctagon className="w-3.5 h-3.5 mr-1" /> Past Due (Expired)
            </span>
            <span className="px-2 py-0.5 rounded-full text-[11px] font-black bg-rose-100 text-rose-800 border border-rose-300">
              {pastDueCount}
            </span>
          </div>
          <div className="text-2xl font-black text-rose-700">{pastDueCount} <span className="text-xs font-normal text-slate-500">lots</span></div>
          <div className="text-xs text-slate-500 mt-1 flex items-center justify-between">
            <span>Value at risk:</span>
            <span className="font-bold text-rose-600">${pastDueValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>
        </div>

        <div className="bg-white border border-orange-200 rounded-xl p-4 shadow-xs bg-gradient-to-br from-orange-50/50 to-white">
          <div className="flex items-center justify-between text-orange-600 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider flex items-center">
              <AlertTriangle className="w-3.5 h-3.5 mr-1" /> Next 30 Days
            </span>
            <span className="px-2 py-0.5 rounded-full text-[11px] font-black bg-orange-100 text-orange-800 border border-orange-300">
              {next30Count}
            </span>
          </div>
          <div className="text-2xl font-black text-orange-700">{next30Count} <span className="text-xs font-normal text-slate-500">lots</span></div>
          <div className="text-xs text-slate-500 mt-1 flex items-center justify-between">
            <span>Urgent FEFO Value:</span>
            <span className="font-bold text-orange-600">${next30Value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>
        </div>

        <div className="bg-white border border-emerald-200 rounded-xl p-4 shadow-xs bg-gradient-to-br from-emerald-50/50 to-white">
          <div className="flex items-center justify-between text-emerald-600 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider flex items-center">
              <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> 90+ Days Safe
            </span>
            <span className="px-2 py-0.5 rounded-full text-[11px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300">
              {safeCount}
            </span>
          </div>
          <div className="text-2xl font-black text-emerald-700">{safeCount} <span className="text-xs font-normal text-slate-500">lots</span></div>
          <div className="text-xs text-slate-500 mt-1 flex items-center justify-between">
            <span>Health ratio:</span>
            <span className="font-bold text-emerald-700">
              {batches.length > 0 ? Math.round((safeCount / batches.length) * 100) : 0}% optimal
            </span>
          </div>
        </div>
      </div>

      {/* Interactive Expiry Range Filter Controls */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-200">
          <div className="flex items-center space-x-2">
            <Filter className="w-4 h-4 text-blue-600" />
            <span className="text-sm font-bold text-slate-900">Interactive Expiry Date Range Filters</span>
            <span className="text-xs text-slate-500 hidden md:inline">
              (Select a horizon to isolate at-risk stock batches)
            </span>
          </div>
          
          <div className="flex items-center space-x-2">
            {(expiryFilter !== 'ALL' || searchQuery || statusFilter !== 'ALL') && (
              <button
                onClick={() => {
                  setExpiryFilter('ALL');
                  setSearchQuery('');
                  setStatusFilter('ALL');
                }}
                className="flex items-center space-x-1 text-xs text-slate-600 hover:text-slate-900 font-semibold px-2.5 py-1 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
                title="Reset all filters"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset</span>
              </button>
            )}

            <button
              onClick={handleExportFilteredBatchesCSV}
              className="flex items-center space-x-1 text-xs text-slate-700 font-semibold px-3 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-50 transition-colors cursor-pointer"
              title="Export current filtered view to CSV"
            >
              <Download className="w-3.5 h-3.5 text-blue-600" />
              <span>Export CSV</span>
            </button>
          </div>
        </div>

        {/* Filter Pills Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
          {filterButtons.map((btn) => {
            const isSelected = expiryFilter === btn.id;
            const Icon = btn.icon;

            // Tailored selected styling
            let selectedBg = 'bg-blue-600 text-white border-blue-600 shadow-sm ring-2 ring-blue-300';
            if (btn.id === 'PAST_DUE') selectedBg = 'bg-rose-600 text-white border-rose-600 shadow-sm ring-2 ring-rose-300';
            if (btn.id === 'NEXT_30_DAYS') selectedBg = 'bg-orange-600 text-white border-orange-600 shadow-sm ring-2 ring-orange-300';
            if (btn.id === 'DAYS_31_60') selectedBg = 'bg-amber-600 text-white border-amber-600 shadow-sm ring-2 ring-amber-300';
            if (btn.id === 'DAYS_61_90') selectedBg = 'bg-blue-600 text-white border-blue-600 shadow-sm ring-2 ring-blue-300';
            if (btn.id === 'DAYS_90_PLUS') selectedBg = 'bg-emerald-600 text-white border-emerald-600 shadow-sm ring-2 ring-emerald-300';

            return (
              <button
                key={btn.id}
                onClick={() => {
                  setExpiryFilter(btn.id);
                  // If current selected batch does not meet the filter, pick the first matching batch
                  const matching = batches.filter((b) => {
                    if (btn.id === 'ALL') return true;
                    const d = getDaysToExpiry(b.bestBeforeDate);
                    const isExp = b.status === 'EXPIRED' || d <= 0;
                    if (btn.id === 'PAST_DUE') return isExp;
                    if (btn.id === 'NEXT_30_DAYS') return !isExp && d > 0 && d <= 30;
                    if (btn.id === 'DAYS_31_60') return !isExp && d > 30 && d <= 60;
                    if (btn.id === 'DAYS_61_90') return !isExp && d > 60 && d <= 90;
                    if (btn.id === 'DAYS_90_PLUS') return !isExp && d > 90;
                    return true;
                  });
                  if (matching.length > 0 && !matching.some((b) => b.batchNo === selectedBatchNo)) {
                    setSelectedBatchNo(matching[0].batchNo);
                  }
                }}
                className={`flex flex-col p-3 rounded-xl border text-left transition-all cursor-pointer relative ${
                  isSelected ? selectedBg : `bg-slate-50 border-slate-200 ${btn.accentClass}`
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <Icon className={`w-4 h-4 ${isSelected ? 'text-white' : ''}`} />
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full font-black font-mono border ${
                      isSelected ? 'bg-white/20 text-white border-white/40' : btn.badgeBg
                    }`}
                  >
                    {btn.count}
                  </span>
                </div>
                <div className={`text-xs font-bold leading-tight ${isSelected ? 'text-white' : 'text-slate-900'}`}>
                  {btn.label}
                </div>
                <div className={`text-[11px] mt-0.5 truncate ${isSelected ? 'text-white/80' : 'text-slate-500'}`}>
                  {btn.sublabel}
                </div>
              </button>
            );
          })}
        </div>

        {/* Search & Secondary Filter Toolbar */}
        <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by Batch No, Item SKU, Name, Bin, or Supplier..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="flex items-center space-x-2 w-full sm:w-auto">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-700 font-medium focus:outline-none focus:border-blue-500 w-full sm:w-auto"
            >
              <option value="ALL">All Lot Statuses</option>
              <option value="ACTIVE">Active Only</option>
              <option value="QUARANTINED">Quarantined Only</option>
            </select>

            <select
              value={`${sortField}-${sortAsc ? 'asc' : 'desc'}`}
              onChange={(e) => {
                const [f, d] = e.target.value.split('-');
                setSortField(f as any);
                setSortAsc(d === 'asc');
              }}
              className="px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-700 font-medium focus:outline-none focus:border-blue-500 w-full sm:w-auto"
            >
              <option value="expiry-asc">Expiry: Nearest First (FEFO)</option>
              <option value="expiry-desc">Expiry: Furthest First</option>
              <option value="batchNo-asc">Batch No: A to Z</option>
              <option value="qty-desc">Quantity: High to Low</option>
              <option value="qty-asc">Quantity: Low to High</option>
            </select>
          </div>
        </div>
      </div>

      {/* Filtered Batches Isolation Table */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
        <div className="p-4 bg-slate-50/80 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Matching Batches ({filteredBatches.length})
            </span>
            {expiryFilter !== 'ALL' && (
              <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-blue-100 text-blue-800 border border-blue-200">
                Filter: {filterButtons.find((f) => f.id === expiryFilter)?.label}
              </span>
            )}
          </div>
          <span className="text-xs text-slate-500 hidden sm:inline">
            Click any row to inspect complete 360° Traceability Lineage
          </span>
        </div>

        {filteredBatches.length === 0 ? (
          <div className="p-8 text-center space-y-3">
            <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mx-auto text-slate-400">
              <Package className="w-6 h-6" />
            </div>
            <div className="text-sm font-bold text-slate-700">No batches match the current filter criteria</div>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              There are no batches in the '{filterButtons.find((f) => f.id === expiryFilter)?.label}' expiry range matching your search.
            </p>
            <button
              onClick={() => {
                setExpiryFilter('ALL');
                setSearchQuery('');
                setStatusFilter('ALL');
              }}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold cursor-pointer transition-colors"
            >
              Clear Expiry Range Filter
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto max-h-[380px] overflow-y-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100/90 text-slate-600 uppercase text-[11px] sticky top-0 z-10 border-b border-slate-200 font-mono">
                <tr>
                  <th className="py-2.5 px-4 font-bold">Batch / Lot No</th>
                  <th className="py-2.5 px-4 font-bold">Product Item</th>
                  <th className="py-2.5 px-4 font-bold">Location Bin</th>
                  <th className="py-2.5 px-4 font-bold">Best Before Date (BBD)</th>
                  <th className="py-2.5 px-4 font-bold">Expiry Status</th>
                  <th className="py-2.5 px-4 font-bold text-right">On-Hand Qty</th>
                  <th className="py-2.5 px-4 font-bold text-right">Est. Value</th>
                  <th className="py-2.5 px-4 font-bold text-center">Lot Status</th>
                  <th className="py-2.5 px-4 font-bold text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredBatches.map((b) => {
                  const isSelected = activeBatch?.batchNo === b.batchNo;
                  const expiryInfo = getExpiryStatusInfo(b.bestBeforeDate, b.status);
                  const Icon = expiryInfo.icon;
                  const lotValue = (b.quantityOnHand * (b.unitCost || 0)).toFixed(2);

                  return (
                    <tr
                      key={b.id}
                      onClick={() => setSelectedBatchNo(b.batchNo)}
                      className={`cursor-pointer transition-colors ${
                        isSelected
                          ? 'bg-blue-50/90 hover:bg-blue-100/80 font-medium'
                          : 'hover:bg-slate-50'
                      }`}
                    >
                      <td className="py-3 px-4 font-mono font-bold text-slate-900 whitespace-nowrap">
                        <div className="flex items-center space-x-1.5">
                          {isSelected && <span className="w-2 h-2 rounded-full bg-blue-600 inline-block shrink-0" />}
                          <span className={isSelected ? 'text-blue-700' : ''}>{b.batchNo}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4 max-w-xs truncate">
                        <div className="font-semibold text-slate-900 truncate">{b.itemName}</div>
                        <div className="text-[11px] font-mono text-slate-400">SKU: {b.sku}</div>
                      </td>
                      <td className="py-3 px-4 font-mono font-semibold text-slate-700 whitespace-nowrap">
                        📍 {b.locationId}
                      </td>
                      <td className="py-3 px-4 font-mono font-semibold text-slate-800 whitespace-nowrap">
                        {b.bestBeforeDate}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${expiryInfo.badgeClass}`}
                        >
                          <Icon className="w-3 h-3 shrink-0" />
                          <span>{expiryInfo.label}</span>
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-slate-900 whitespace-nowrap">
                        {b.quantityOnHand.toLocaleString()}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-slate-600 whitespace-nowrap">
                        ${lotValue}
                      </td>
                      <td className="py-3 px-4 text-center whitespace-nowrap">
                        <span
                          className={`px-2 py-0.5 rounded text-[11px] font-bold font-mono ${
                            b.status === 'QUARANTINED'
                              ? 'bg-rose-100 text-rose-800 border border-rose-300'
                              : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                          }`}
                        >
                          {b.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-center space-x-1.5">
                          <button
                            onClick={() => setSelectedBatchNo(b.batchNo)}
                            className={`px-2.5 py-1 rounded text-[11px] font-bold transition-colors cursor-pointer ${
                              isSelected
                                ? 'bg-blue-600 text-white'
                                : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                            }`}
                          >
                            Trace
                          </button>
                          <button
                            onClick={() => handleOpenQuarantineModal(b)}
                            title={b.status === 'QUARANTINED' ? 'Release Quarantine' : 'Hold / Quarantine'}
                            className={`p-1 rounded text-xs transition-colors cursor-pointer ${
                              b.status === 'QUARANTINED'
                                ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                                : 'bg-rose-100 text-rose-700 hover:bg-rose-200'
                            }`}
                          >
                            <ShieldAlert className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Selected Batch Details & Traceability Flow */}
      {activeBatch && (
        <div className="space-y-4">
          
          {/* Expiry Risk Alert Banner for Active Batch */}
          {activeBatchExpiryInfo && (activeBatchExpiryInfo.category === 'PAST_DUE' || activeBatchExpiryInfo.category === 'NEXT_30_DAYS') && (
            <div
              className={`p-4 rounded-xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-sm ${
                activeBatchExpiryInfo.category === 'PAST_DUE'
                  ? 'bg-rose-50 border-rose-300 text-rose-900'
                  : 'bg-orange-50 border-orange-300 text-orange-900'
              }`}
            >
              <div className="flex items-center space-x-3">
                <div
                  className={`p-2 rounded-lg shrink-0 ${
                    activeBatchExpiryInfo.category === 'PAST_DUE' ? 'bg-rose-200 text-rose-800' : 'bg-orange-200 text-orange-800'
                  }`}
                >
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-black text-sm">
                    {activeBatchExpiryInfo.category === 'PAST_DUE'
                      ? 'FEFO CRITICAL ALERT: Best Before Date Has Expired!'
                      : 'FEFO WARNING: Batch Nearing Expiry Within 30 Days!'}
                  </div>
                  <p className="text-xs mt-0.5 opacity-90">
                    Batch <span className="font-mono font-bold">{activeBatch.batchNo}</span> (BBD: {activeBatch.bestBeforeDate}, {activeBatchExpiryInfo.label}).
                    {activeBatchExpiryInfo.category === 'PAST_DUE'
                      ? ' Quarantining is recommended to halt any order pick allocations.'
                      : ' Prioritize for immediate outbound stock allocation via First-Expired-First-Out rule.'}
                  </p>
                </div>
              </div>

              {activeBatch.status !== 'QUARANTINED' && (
                <button
                  onClick={() => handleOpenQuarantineModal(activeBatch)}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-lg shadow-xs shrink-0 cursor-pointer transition-colors"
                >
                  Hold / Quarantine Lot
                </button>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Left Column: Lot Master Specs */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4 shadow-xs">
              <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                <div className="flex items-center space-x-2">
                  <span className="text-xs font-mono font-bold text-blue-600 uppercase">Lot Master Card</span>
                  {activeBatchExpiryInfo && (
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${activeBatchExpiryInfo.badgeClass}`}>
                      {activeBatchExpiryInfo.label}
                    </span>
                  )}
                </div>
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
                  <span className="font-bold text-slate-900 flex items-center space-x-1">
                    <span>{activeBatch.bestBeforeDate}</span>
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Days to Expiry:</span>
                  <span className={`font-bold ${activeBatchExpiryInfo?.textColor || 'text-slate-900'}`}>
                    {getDaysToExpiry(activeBatch.bestBeforeDate)} days
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Current Storage Bin:</span>
                  <span className="text-emerald-700 font-bold">📍 {activeBatch.locationId}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Quantity On-Hand:</span>
                  <span className="text-slate-900 font-bold">{activeBatch.quantityOnHand} units</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Lot Inventory Value:</span>
                  <span className="text-slate-900 font-bold">
                    ${(activeBatch.quantityOnHand * (activeBatch.unitCost || 0)).toFixed(2)}
                  </span>
                </div>
              </div>

              <div>
                <p className="text-xs text-slate-500 mb-1">Supplier Origin:</p>
                <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200 flex items-center space-x-2 text-xs text-slate-800">
                  <Building2 className="w-4 h-4 text-blue-600" />
                  <span className="font-semibold">{activeBatch.supplier}</span>
                </div>
              </div>

              {/* Quarantine Action Button */}
              <button
                onClick={() => handleOpenQuarantineModal(activeBatch)}
                className={`w-full py-2.5 rounded-lg text-xs font-bold flex items-center justify-center space-x-2 transition-all cursor-pointer ${
                  activeBatch.status === 'QUARANTINED'
                    ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-xs'
                    : 'bg-rose-600 hover:bg-rose-500 text-white shadow-xs'
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
                    <div className="text-sm font-bold text-slate-900 truncate">{activeBatch.supplier}</div>
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
                    <p className="text-xs text-slate-500 truncate">
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
        </div>
      )}

      {/* Emergency Quarantine Modal */}
      {showQuarantineModal && (targetQuarantineBatch || activeBatch) && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-rose-300 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 text-slate-900">
            <div className="flex items-center space-x-3">
              <div className="p-3 bg-rose-100 rounded-xl text-rose-700 border border-rose-200">
                <ShieldAlert className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-lg">
                  {(targetQuarantineBatch || activeBatch)?.status === 'QUARANTINED'
                    ? 'Release Batch Quarantine'
                    : 'Trigger Batch Recall / Hold'}
                </h3>
                <p className="text-xs text-slate-500 font-mono">
                  Batch: {(targetQuarantineBatch || activeBatch)?.batchNo}
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              {(targetQuarantineBatch || activeBatch)?.status === 'QUARANTINED'
                ? 'Releasing this batch will restore available stock for order picking and FEFO allocation routes.'
                : 'Quarantining this batch will lock all available quantities across all warehouse bins, preventing any picking routes from assigning this lot.'}
            </p>

            {(targetQuarantineBatch || activeBatch)?.status !== 'QUARANTINED' && (
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Reason for Recall / Hold</label>
                <input
                  type="text"
                  placeholder="e.g., Quality defect, packaging tear, expiry past due threshold"
                  value={quarantineReasonInput}
                  onChange={(e) => setQuarantineReasonInput(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2.5 text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-rose-500"
                />
              </div>
            )}

            <div className="flex justify-end space-x-2 pt-2">
              <button
                onClick={() => {
                  setShowQuarantineModal(false);
                  setTargetQuarantineBatch(null);
                }}
                className="px-4 py-2 bg-slate-100 text-slate-700 hover:bg-slate-200 text-xs font-semibold rounded-lg cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleApplyQuarantine}
                className={`px-5 py-2 text-xs font-semibold rounded-lg text-white shadow-xs cursor-pointer ${
                  (targetQuarantineBatch || activeBatch)?.status === 'QUARANTINED'
                    ? 'bg-emerald-600 hover:bg-emerald-500'
                    : 'bg-rose-600 hover:bg-rose-500'
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
