import React, { useState, useMemo } from 'react';
import {
  FileText,
  Calendar,
  Filter,
  Download,
  Printer,
  Search,
  Boxes,
  CheckCircle2,
  AlertTriangle,
  ShieldAlert,
  ArrowDownLeft,
  ArrowUpRight,
  RefreshCw,
  DollarSign,
  TrendingUp,
  TrendingDown,
  Layers,
  MapPin,
  Clock,
  Copy,
  Check,
  BarChart3,
  X,
  Building2,
  Truck,
  ShoppingCart
} from 'lucide-react';
import { Batch, Location, ProductSKU, StockMovement, ZoneType, StorageZone } from '../types/wms';
import { UserProfile } from '../types/roles';
import { INITIAL_ZONES } from '../data/initialData';

interface InventoryReportGeneratorProps {
  skus: ProductSKU[];
  batches: Batch[];
  locations: Location[];
  zones?: StorageZone[];
  stockMovements: StockMovement[];
  currentUser: UserProfile;
  onRefresh?: () => void;
  onLogAuditActivity?: (
    actionCategory: any,
    actionType: string,
    targetEntity: string,
    details: string,
    severity?: 'INFO' | 'WARNING' | 'CRITICAL'
  ) => void;
  enableSafetyReorder?: boolean;
  onToggleSafetyReorder?: (enabled: boolean) => void;
}

export type ReportType =
  | 'VALUATION_STOCK'
  | 'FEFO_EXPIRY'
  | 'STOCK_MOVEMENTS'
  | 'LOW_STOCK_REORDER'
  | 'QUARANTINE_AUDIT';

export type DatePreset =
  | 'ALL_TIME'
  | 'TODAY'
  | 'LAST_7_DAYS'
  | 'LAST_30_DAYS'
  | 'THIS_MONTH'
  | 'NEXT_30_DAYS_EXPIRY'
  | 'NEXT_90_DAYS_EXPIRY'
  | 'CUSTOM';

export const InventoryReportGenerator: React.FC<InventoryReportGeneratorProps> = ({
  skus,
  batches,
  locations,
  zones,
  stockMovements,
  currentUser,
  onRefresh,
  onLogAuditActivity,
  enableSafetyReorder = true,
  onToggleSafetyReorder
}) => {
  // Report Config State
  const [reportType, setReportType] = useState<ReportType>('VALUATION_STOCK');
  
  // Date Filters
  const [datePreset, setDatePreset] = useState<DatePreset>('ALL_TIME');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [dateTargetField, setDateTargetField] = useState<'bbd' | 'inbound' | 'movement'>('bbd');

  // Dimensional Filters
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedZone, setSelectedZone] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [selectedExpiryRisk, setSelectedExpiryRisk] = useState<string>('ALL');
  const [selectedSupplier, setSelectedSupplier] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // UI state
  const [copiedSummary, setCopiedSummary] = useState(false);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [sortField, setSortField] = useState<string>('value');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Available Categories
  const categories = useMemo(() => {
    const set = new Set<string>();
    skus.forEach((s) => s.category && set.add(s.category));
    return Array.from(set);
  }, [skus]);

  // Available Suppliers
  const suppliers = useMemo(() => {
    const set = new Set<string>();
    batches.forEach((b) => b.supplier && set.add(b.supplier));
    return Array.from(set);
  }, [batches]);

  // Handle Preset Date changes
  const handleDatePresetChange = (preset: DatePreset) => {
    setDatePreset(preset);
    const today = new Date();
    
    if (preset === 'ALL_TIME') {
      setStartDate('');
      setEndDate('');
    } else if (preset === 'TODAY') {
      const dateStr = today.toISOString().split('T')[0];
      setStartDate(dateStr);
      setEndDate(dateStr);
    } else if (preset === 'LAST_7_DAYS') {
      const past = new Date(today.getTime() - 7 * 86400000);
      setStartDate(past.toISOString().split('T')[0]);
      setEndDate(today.toISOString().split('T')[0]);
    } else if (preset === 'LAST_30_DAYS') {
      const past = new Date(today.getTime() - 30 * 86400000);
      setStartDate(past.toISOString().split('T')[0]);
      setEndDate(today.toISOString().split('T')[0]);
    } else if (preset === 'THIS_MONTH') {
      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      setStartDate(startOfMonth.toISOString().split('T')[0]);
      setEndDate(endOfMonth.toISOString().split('T')[0]);
    } else if (preset === 'NEXT_30_DAYS_EXPIRY') {
      setDateTargetField('bbd');
      const future = new Date(today.getTime() + 30 * 86400000);
      setStartDate(today.toISOString().split('T')[0]);
      setEndDate(future.toISOString().split('T')[0]);
    } else if (preset === 'NEXT_90_DAYS_EXPIRY') {
      setDateTargetField('bbd');
      const future = new Date(today.getTime() + 90 * 86400000);
      setStartDate(today.toISOString().split('T')[0]);
      setEndDate(future.toISOString().split('T')[0]);
    }
  };

  // Helper for expiry risk level calculation
  const getExpiryAlertLevel = (bestBeforeDate: string) => {
    if (!bestBeforeDate) return 'HEALTHY';
    const now = new Date();
    const bbd = new Date(bestBeforeDate);
    const diffDays = Math.ceil((bbd.getTime() - now.getTime()) / (1000 * 3600 * 24));
    if (diffDays <= 14) return 'CRITICAL';
    if (diffDays <= 30) return 'EXPIRING_SOON';
    return 'HEALTHY';
  };

  // Calculate Days Remaining
  const getDaysRemaining = (bestBeforeDate: string) => {
    if (!bestBeforeDate) return 999;
    const now = new Date();
    const bbd = new Date(bestBeforeDate);
    return Math.ceil((bbd.getTime() - now.getTime()) / (1000 * 3600 * 24));
  };

  // Stock Map per SKU for reorder calculations
  const skuStockMap = useMemo(() => {
    const map = new Map<string, { totalOnHand: number; totalAvailable: number }>();
    skus.forEach((s) => map.set(s.sku, { totalOnHand: 0, totalAvailable: 0 }));
    batches.forEach((b) => {
      const existing = map.get(b.sku) || { totalOnHand: 0, totalAvailable: 0 };
      map.set(b.sku, {
        totalOnHand: existing.totalOnHand + (b.quantityOnHand || 0),
        totalAvailable: existing.totalAvailable + (b.quantityAvailable || 0)
      });
    });
    return map;
  }, [skus, batches]);

  // Main Filter Logic
  const filteredBatches = useMemo(() => {
    return batches.filter((b) => {
      const skuObj = skus.find((s) => s.sku === b.sku);
      const category = skuObj?.category || 'General';
      const zone = skuObj?.storageZone || locations.find((l) => l.id === b.locationId)?.zone || 'DRY';
      const expiryRisk = getExpiryAlertLevel(b.bestBeforeDate);

      // Category match
      if (selectedCategory !== 'ALL' && category !== selectedCategory) return false;
      // Zone match
      if (selectedZone !== 'ALL' && zone !== selectedZone) return false;
      // Status match
      if (selectedStatus !== 'ALL' && b.status !== selectedStatus) return false;
      // Expiry risk match
      if (selectedExpiryRisk !== 'ALL' && expiryRisk !== selectedExpiryRisk) return false;
      // Supplier match
      if (selectedSupplier !== 'ALL' && b.supplier !== selectedSupplier) return false;

      // Text Search
      if (searchQuery.trim() !== '') {
        const q = searchQuery.toLowerCase();
        const matches =
          b.batchNo.toLowerCase().includes(q) ||
          b.sku.toLowerCase().includes(q) ||
          b.itemName.toLowerCase().includes(q) ||
          b.locationId.toLowerCase().includes(q) ||
          b.supplier.toLowerCase().includes(q);
        if (!matches) return false;
      }

      // Date Range Filtering
      if (startDate || endDate) {
        let compareDateStr = '';
        if (dateTargetField === 'bbd') {
          compareDateStr = b.bestBeforeDate;
        } else if (dateTargetField === 'inbound') {
          compareDateStr = b.receivedAt ? b.receivedAt.split('T')[0] : b.manufactureDate;
        }

        if (compareDateStr) {
          if (startDate && compareDateStr < startDate) return false;
          if (endDate && compareDateStr > endDate) return false;
        }
      }

      return true;
    });
  }, [
    batches,
    skus,
    locations,
    selectedCategory,
    selectedZone,
    selectedStatus,
    selectedExpiryRisk,
    selectedSupplier,
    searchQuery,
    startDate,
    endDate,
    dateTargetField
  ]);

  // Filtered Movements for Movement Report
  const filteredMovements = useMemo(() => {
    return stockMovements.filter((m) => {
      const skuObj = skus.find((s) => s.sku === m.sku);
      const category = skuObj?.category || 'General';

      if (selectedCategory !== 'ALL' && category !== selectedCategory) return false;

      if (searchQuery.trim() !== '') {
        const q = searchQuery.toLowerCase();
        const matches =
          m.batchNo.toLowerCase().includes(q) ||
          m.sku.toLowerCase().includes(q) ||
          m.locationId.toLowerCase().includes(q) ||
          m.performedBy.toLowerCase().includes(q) ||
          m.type.toLowerCase().includes(q);
        if (!matches) return false;
      }

      if (startDate || endDate) {
        const movementDate = m.timestamp.split(' ')[0];
        if (startDate && movementDate < startDate) return false;
        if (endDate && movementDate > endDate) return false;
      }

      return true;
    });
  }, [stockMovements, skus, selectedCategory, searchQuery, startDate, endDate]);

  // Filtered SKUs for Low Stock / Reorder Report
  const filteredReorderSkus = useMemo(() => {
    return skus.filter((sku) => {
      const stock = skuStockMap.get(sku.sku)?.totalOnHand || 0;
      const isLow = stock <= sku.reorderPoint;

      if (!isLow && reportType === 'LOW_STOCK_REORDER') {
        // If low stock report mode, only show SKUs needing reorder
        if (selectedStatus === 'HEALTHY') return false;
      }

      if (selectedCategory !== 'ALL' && sku.category !== selectedCategory) return false;
      if (selectedZone !== 'ALL' && sku.storageZone !== selectedZone) return false;

      if (searchQuery.trim() !== '') {
        const q = searchQuery.toLowerCase();
        const matches =
          sku.sku.toLowerCase().includes(q) ||
          sku.name.toLowerCase().includes(q) ||
          sku.category.toLowerCase().includes(q);
        if (!matches) return false;
      }

      return true;
    });
  }, [skus, skuStockMap, selectedCategory, selectedZone, selectedStatus, searchQuery, reportType]);

  // Report Metrics Summary
  const metrics = useMemo(() => {
    const totalLots = filteredBatches.length;
    const totalUnits = filteredBatches.reduce((sum, b) => sum + (b.quantityOnHand || 0), 0);
    const totalValue = filteredBatches.reduce(
      (sum, b) => sum + (b.quantityOnHand || 0) * (b.unitCost || 0),
      0
    );

    const criticalAlerts = filteredBatches.filter(
      (b) => getExpiryAlertLevel(b.bestBeforeDate) === 'CRITICAL'
    ).length;

    const expiringSoon = filteredBatches.filter(
      (b) => getExpiryAlertLevel(b.bestBeforeDate) === 'EXPIRING_SOON'
    ).length;

    const quarantinedCount = filteredBatches.filter((b) => b.status === 'QUARANTINED').length;

    const totalDaysToExpiry = filteredBatches.reduce(
      (sum, b) => sum + Math.max(0, getDaysRemaining(b.bestBeforeDate)),
      0
    );
    const avgDaysToExpiry = totalLots > 0 ? Math.round(totalDaysToExpiry / totalLots) : 0;

    // Category Value Breakdown
    const categoryBreakdownMap = new Map<string, { units: number; val: number }>();
    filteredBatches.forEach((b) => {
      const cat = skus.find((s) => s.sku === b.sku)?.category || 'Uncategorized';
      const existing = categoryBreakdownMap.get(cat) || { units: 0, val: 0 };
      categoryBreakdownMap.set(cat, {
        units: existing.units + (b.quantityOnHand || 0),
        val: existing.val + (b.quantityOnHand || 0) * (b.unitCost || 0)
      });
    });

    return {
      totalLots,
      totalUnits,
      totalValue,
      criticalAlerts,
      expiringSoon,
      quarantinedCount,
      avgDaysToExpiry,
      categoryBreakdown: Array.from(categoryBreakdownMap.entries()).map(([cat, data]) => ({
        category: cat,
        units: data.units,
        value: data.val
      }))
    };
  }, [filteredBatches, skus]);

  // Sorted Rows for Data Table
  const sortedBatches = useMemo(() => {
    return [...filteredBatches].sort((a, b) => {
      let valA: any = 0;
      let valB: any = 0;

      if (sortField === 'value') {
        valA = a.quantityOnHand * a.unitCost;
        valB = b.quantityOnHand * b.unitCost;
      } else if (sortField === 'qty') {
        valA = a.quantityOnHand;
        valB = b.quantityOnHand;
      } else if (sortField === 'bbd') {
        valA = a.bestBeforeDate;
        valB = b.bestBeforeDate;
      } else if (sortField === 'batchNo') {
        valA = a.batchNo;
        valB = b.batchNo;
      } else if (sortField === 'sku') {
        valA = a.sku;
        valB = b.sku;
      }

      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });
  }, [filteredBatches, sortField, sortOrder]);

  // Toggle Sort Order
  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  // Export CSV Function
  const handleExportCsv = () => {
    let headers = [];
    let rows: string[][] = [];
    let filename = `ApexWMS_Inventory_Report_${reportType}_${new Date().toISOString().split('T')[0]}.csv`;

    if (reportType === 'VALUATION_STOCK' || reportType === 'FEFO_EXPIRY' || reportType === 'QUARANTINE_AUDIT') {
      headers = [
        'Batch No',
        'SKU',
        'Item Name',
        'Category',
        'Bin Location',
        'Quantity On Hand',
        'Unit Cost ($)',
        'Total Value ($)',
        'Manufacture Date',
        'Best Before Date',
        'Days Remaining',
        'Expiry Risk Level',
        'Batch Status',
        'Supplier'
      ];

      rows = sortedBatches.map((b) => {
        const cat = skus.find((s) => s.sku === b.sku)?.category || 'N/A';
        const val = (b.quantityOnHand * b.unitCost).toFixed(2);
        const days = getDaysRemaining(b.bestBeforeDate);
        const risk = getExpiryAlertLevel(b.bestBeforeDate);

        return [
          b.batchNo,
          b.sku,
          `"${b.itemName}"`,
          `"${cat}"`,
          b.locationId,
          String(b.quantityOnHand),
          b.unitCost.toFixed(2),
          val,
          b.manufactureDate || 'N/A',
          b.bestBeforeDate,
          String(days),
          risk,
          b.status,
          `"${b.supplier || 'N/A'}"`
        ];
      });
    } else if (reportType === 'STOCK_MOVEMENTS') {
      filename = `ApexWMS_Stock_Movements_Report_${new Date().toISOString().split('T')[0]}.csv`;
      headers = ['ID', 'Timestamp', 'Type', 'Batch No', 'SKU', 'Location', 'Quantity', 'Performed By', 'Reason'];
      rows = filteredMovements.map((m) => [
        m.id,
        m.timestamp,
        m.type,
        m.batchNo,
        m.sku,
        m.locationId,
        String(m.quantity),
        `"${m.performedBy}"`,
        `"${m.reason || ''}"`
      ]);
    } else if (reportType === 'LOW_STOCK_REORDER') {
      filename = `ApexWMS_Low_Stock_Reorder_Plan_${new Date().toISOString().split('T')[0]}.csv`;
      headers = ['SKU', 'Item Name', 'Category', 'Unit', 'On Hand Stock', 'Reorder Threshold', 'Status', 'Recommended Reorder Qty', 'Est. Reorder Cost ($)'];
      rows = filteredReorderSkus.map((sku) => {
        const stock = skuStockMap.get(sku.sku)?.totalOnHand || 0;
        const isLow = stock <= sku.reorderPoint;
        const recQty = Math.max(50, Math.ceil((sku.reorderPoint * 2 - stock) / 25) * 25);
        const matchingBatch = batches.find((b) => b.sku === sku.sku);
        const unitCost = matchingBatch?.unitCost || 15.0;
        const estCost = (recQty * unitCost).toFixed(2);

        return [
          sku.sku,
          `"${sku.name}"`,
          `"${sku.category}"`,
          sku.unit,
          String(stock),
          String(sku.reorderPoint),
          isLow ? 'REORDER NEEDED' : 'HEALTHY',
          String(recQty),
          estCost
        ];
      });
    }

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    if (onLogAuditActivity) {
      onLogAuditActivity(
        'INVENTORY',
        'REPORT_EXPORT_CSV',
        `Report: ${reportType}`,
        `Exported ${rows.length} rows to CSV file ${filename} with date filters [${startDate || 'All'} to ${endDate || 'All'}].`,
        'INFO'
      );
    }
  };

  // Copy Executive Text Summary to Clipboard
  const handleCopySummary = () => {
    const text = `=== APEX WMS INVENTORY REPORT SUMMARY ===
Report Type: ${reportType.replace('_', ' ')}
Generated At: ${new Date().toLocaleString()}
Generated By: ${currentUser.name} (${currentUser.role})
Date Filter: ${datePreset} (${startDate || 'Start'} to ${endDate || 'End'})

KEY METRICS:
- Total Filtered Lots: ${metrics.totalLots}
- Total Inventory On-Hand: ${metrics.totalUnits.toLocaleString()} units
- Total Inventory Valuation: $${metrics.totalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
- Critical Expiry Lots (<14 days): ${metrics.criticalAlerts}
- Quarantined Lots: ${metrics.quarantinedCount}
- Average Days to Expiry: ${metrics.avgDaysToExpiry} days

CONFIDENTIAL • APEX WMS ENTERPRISE ENGINE
`;

    navigator.clipboard.writeText(text);
    setCopiedSummary(true);
    setTimeout(() => setCopiedSummary(false), 2500);
  };

  return (
    <div className="space-y-6">
      
      {/* Header Banner */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2 text-blue-600 font-bold text-xs uppercase tracking-wider mb-1">
            <BarChart3 className="w-4 h-4" />
            <span>Enterprise Inventory Analytics & Report Generator</span>
          </div>
          <h2 className="text-2xl font-black text-slate-900">
            Custom Inventory Reporting & Date Analytics
          </h2>
          <p className="text-sm text-slate-600 mt-1 max-w-2xl">
            Generate custom valuation audits, FEFO risk matrixes, stock movement logs, and reorder planning reports with multi-variable filters and date ranges.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center space-x-2 flex-wrap gap-2">
          <button
            onClick={handleCopySummary}
            className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold border border-slate-300 flex items-center space-x-1.5 transition-all cursor-pointer"
          >
            {copiedSummary ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4 text-slate-600" />}
            <span>{copiedSummary ? 'Summary Copied!' : 'Copy Summary'}</span>
          </button>

          <button
            onClick={() => setShowPrintModal(true)}
            className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold border border-slate-300 flex items-center space-x-1.5 transition-all cursor-pointer"
          >
            <Printer className="w-4 h-4 text-blue-600" />
            <span>Printable Report</span>
          </button>

          <button
            onClick={handleExportCsv}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-xs flex items-center space-x-2 transition-all cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>Export CSV Report</span>
          </button>
        </div>
      </div>

      {/* Control Panel: Report Type Tabs + Date Pickers + Filters */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-5">
        
        {/* Step 1: Select Report Type */}
        <div>
          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
            1. Select Report Template
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
            
            <button
              onClick={() => setReportType('VALUATION_STOCK')}
              className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                reportType === 'VALUATION_STOCK'
                  ? 'bg-blue-50 border-blue-600 text-blue-900 shadow-xs'
                  : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
              }`}
            >
              <div className="flex items-center space-x-2 font-bold text-xs mb-1">
                <DollarSign className="w-4 h-4 text-blue-600" />
                <span>Valuation & Stock</span>
              </div>
              <p className="text-[11px] text-slate-500 leading-tight">
                Total on-hand units, item valuations ($), and category stock splits.
              </p>
            </button>

            <button
              onClick={() => setReportType('FEFO_EXPIRY')}
              className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                reportType === 'FEFO_EXPIRY'
                  ? 'bg-amber-50 border-amber-500 text-amber-900 shadow-xs'
                  : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
              }`}
            >
              <div className="flex items-center space-x-2 font-bold text-xs mb-1">
                <Calendar className="w-4 h-4 text-amber-600" />
                <span>FEFO & Expiry Risk</span>
              </div>
              <p className="text-[11px] text-slate-500 leading-tight">
                Best Before Date matrix, days remaining, critical alerts (&lt;14d).
              </p>
            </button>

            <button
              onClick={() => setReportType('STOCK_MOVEMENTS')}
              className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                reportType === 'STOCK_MOVEMENTS'
                  ? 'bg-purple-50 border-purple-500 text-purple-900 shadow-xs'
                  : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
              }`}
            >
              <div className="flex items-center space-x-2 font-bold text-xs mb-1">
                <Clock className="w-4 h-4 text-purple-600" />
                <span>Stock Movements Log</span>
              </div>
              <p className="text-[11px] text-slate-500 leading-tight">
                Inbound receipts, picks, quarantine moves over date window.
              </p>
            </button>

            <button
              onClick={() => setReportType('LOW_STOCK_REORDER')}
              className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                reportType === 'LOW_STOCK_REORDER'
                  ? 'bg-orange-50 border-orange-500 text-orange-900 shadow-xs'
                  : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
              }`}
            >
              <div className="flex items-center space-x-2 font-bold text-xs mb-1">
                <ShoppingCart className="w-4 h-4 text-orange-600" />
                <span>Reorder Planning</span>
              </div>
              <p className="text-[11px] text-slate-500 leading-tight">
                SKUs at or below safety reorder threshold with est. PO cost.
              </p>
            </button>

            <button
              onClick={() => setReportType('QUARANTINE_AUDIT')}
              className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                reportType === 'QUARANTINE_AUDIT'
                  ? 'bg-rose-50 border-rose-500 text-rose-900 shadow-xs'
                  : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
              }`}
            >
              <div className="flex items-center space-x-2 font-bold text-xs mb-1">
                <ShieldAlert className="w-4 h-4 text-rose-600" />
                <span>Quarantine & Holds</span>
              </div>
              <p className="text-[11px] text-slate-500 leading-tight">
                Locked lots, QA hold reasons, locked valuation breakdown.
              </p>
            </button>

          </div>
        </div>

        <hr className="border-slate-200" />

        {/* Step 2: Date Choose & Preset Selector */}
        <div>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 mb-2">
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">
              2. Date Choose & Time Window
            </label>
            <div className="flex items-center space-x-3 text-xs">
              <span className="text-slate-500 font-semibold">Target Date Field:</span>
              <label className="flex items-center space-x-1 cursor-pointer">
                <input
                  type="radio"
                  name="dateTarget"
                  checked={dateTargetField === 'bbd'}
                  onChange={() => setDateTargetField('bbd')}
                  className="text-blue-600"
                />
                <span className="text-slate-800 font-medium">Best Before Date (BBD)</span>
              </label>
              <label className="flex items-center space-x-1 cursor-pointer">
                <input
                  type="radio"
                  name="dateTarget"
                  checked={dateTargetField === 'inbound'}
                  onChange={() => setDateTargetField('inbound')}
                  className="text-blue-600"
                />
                <span className="text-slate-800 font-medium">Inbound Receive Date</span>
              </label>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-center">
            {/* Presets buttons */}
            <div className="lg:col-span-7 flex flex-wrap gap-1.5">
              {(
                [
                  ['ALL_TIME', 'All Time'],
                  ['TODAY', 'Today'],
                  ['LAST_7_DAYS', 'Last 7 Days'],
                  ['LAST_30_DAYS', 'Last 30 Days'],
                  ['THIS_MONTH', 'This Month'],
                  ['NEXT_30_DAYS_EXPIRY', 'Expiring Next 30d'],
                  ['NEXT_90_DAYS_EXPIRY', 'Expiring Next 90d'],
                  ['CUSTOM', 'Custom Range']
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => handleDatePresetChange(key)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                    datePreset === key
                      ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Date Pickers */}
            <div className="lg:col-span-5 grid grid-cols-2 gap-2 bg-slate-50 p-2 rounded-xl border border-slate-200">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">Start Date</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => {
                    setStartDate(e.target.value);
                    setDatePreset('CUSTOM');
                  }}
                  className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1 text-xs text-slate-800 font-mono focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">End Date</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => {
                    setEndDate(e.target.value);
                    setDatePreset('CUSTOM');
                  }}
                  className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1 text-xs text-slate-800 font-mono focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
          </div>
        </div>

        <hr className="border-slate-200" />

        {/* Step 3: Dimensional Filters */}
        <div>
          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
            3. Multi-Dimensional Filters
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {/* Search query */}
            <div className="relative sm:col-span-2 lg:col-span-1">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search SKU, Batch, Bin, Item..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-500"
              />
            </div>

            {/* Category */}
            <div>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-blue-500"
              >
                <option value="ALL">All Categories</option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            {/* Storage Zone */}
            <div>
              <select
                value={selectedZone}
                onChange={(e) => setSelectedZone(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-blue-500 cursor-pointer"
              >
                <option value="ALL">All Storage Zones</option>
                {(zones && zones.length > 0 ? zones : INITIAL_ZONES).map((z) => (
                  <option key={z.code} value={z.code}>
                    {z.icon ? `${z.icon} ` : ''}{z.title || z.code}
                  </option>
                ))}
              </select>
            </div>

            {/* Expiry Risk Level */}
            <div>
              <select
                value={selectedExpiryRisk}
                onChange={(e) => setSelectedExpiryRisk(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-blue-500"
              >
                <option value="ALL">All Expiry Risk Levels</option>
                <option value="HEALTHY">Healthy (&gt;30 days)</option>
                <option value="EXPIRING_SOON">Expiring Soon (14-30 days)</option>
                <option value="CRITICAL">Critical Alert (&lt;14 days)</option>
              </select>
            </div>

            {/* Supplier */}
            <div>
              <select
                value={selectedSupplier}
                onChange={(e) => setSelectedSupplier(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-blue-500"
              >
                <option value="ALL">All Vendors / Suppliers</option>
                {suppliers.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

          </div>
        </div>

      </div>

      {/* KPI Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Filtered Inventory Lots</p>
          <p className="text-2xl font-black text-slate-900 mt-1">{metrics.totalLots}</p>
          <p className="text-xs text-slate-500 mt-0.5">Matching active filters</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total On-Hand Stock</p>
          <p className="text-2xl font-black text-blue-700 mt-1">{metrics.totalUnits.toLocaleString()}</p>
          <p className="text-xs text-blue-600 mt-0.5 font-medium">Physical inventory count</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Inventory Valuation</p>
          <p className="text-2xl font-black text-emerald-700 mt-1">
            ${metrics.totalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <p className="text-xs text-emerald-600 mt-0.5 font-medium">Sum of unit cost × quantity</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Critical Expiry (&lt;14d)</p>
          <p className={`text-2xl font-black mt-1 ${metrics.criticalAlerts > 0 ? 'text-rose-600' : 'text-slate-900'}`}>
            {metrics.criticalAlerts} <span className="text-xs text-slate-500 font-normal">lots</span>
          </p>
          <p className="text-xs text-rose-700 mt-0.5 font-medium">Requires immediate FEFO dispatch</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Quarantined Held Lots</p>
          <p className="text-2xl font-black text-purple-700 mt-1">{metrics.quarantinedCount}</p>
          <p className="text-xs text-purple-600 mt-0.5 font-medium">Locked for QA inspection</p>
        </div>

      </div>

      {/* Category Valuation Progress Visual Breakdown */}
      {metrics.categoryBreakdown.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-3">
          <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider">
            Category Stock Valuation Breakdown
          </h4>
          <div className="space-y-2.5">
            {metrics.categoryBreakdown.map((item) => {
              const pct = metrics.totalValue > 0 ? Math.round((item.value / metrics.totalValue) * 100) : 0;
              return (
                <div key={item.category} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="font-bold text-slate-800">{item.category}</span>
                    <span className="font-mono text-slate-600">
                      {item.units.toLocaleString()} units • ${item.value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ({pct}%)
                    </span>
                  </div>
                  <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                    <div
                      className="bg-gradient-to-r from-blue-600 to-indigo-600 h-full rounded-full transition-all duration-500"
                      style={{ width: `${Math.max(4, pct)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Main Data Table */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs font-mono">
          <span className="text-slate-800 font-bold flex items-center space-x-2">
            <FileText className="w-4 h-4 text-blue-600" />
            <span>
              Generated Inventory Data Stream (Report Type: {reportType.replace('_', ' ')})
            </span>
          </span>
          <span className="text-slate-500 text-[11px]">
            Showing {reportType === 'STOCK_MOVEMENTS' ? filteredMovements.length : reportType === 'LOW_STOCK_REORDER' ? filteredReorderSkus.length : sortedBatches.length} records
          </span>
        </div>

        {/* View Type 1, 2, 5: Batches List */}
        {(reportType === 'VALUATION_STOCK' || reportType === 'FEFO_EXPIRY' || reportType === 'QUARANTINE_AUDIT') && (
          sortedBatches.length === 0 ? (
            <div className="p-12 text-center space-y-3">
              <Boxes className="w-10 h-10 text-slate-400 mx-auto" />
              <p className="text-slate-600 text-sm font-semibold">No inventory batches match your active filters and date range.</p>
              <button
                onClick={() => {
                  setSelectedCategory('ALL');
                  setSelectedZone('ALL');
                  setSelectedStatus('ALL');
                  setSelectedExpiryRisk('ALL');
                  setSelectedSupplier('ALL');
                  setSearchQuery('');
                  handleDatePresetChange('ALL_TIME');
                }}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg text-xs font-bold"
              >
                Reset All Filters
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto max-h-[550px]">
              <table className="w-full text-left text-xs text-slate-700">
                <thead className="bg-slate-50 text-slate-600 uppercase font-mono border-b border-slate-200 text-[11px] sticky top-0 z-10">
                  <tr>
                    <th className="py-3 px-4 cursor-pointer" onClick={() => handleSort('batchNo')}>
                      Batch / SKU
                    </th>
                    <th className="py-3 px-4">Item Name & Category</th>
                    <th className="py-3 px-4">Bin Location</th>
                    <th className="py-3 px-4 text-right cursor-pointer" onClick={() => handleSort('qty')}>
                      Quantity
                    </th>
                    <th className="py-3 px-4 text-right cursor-pointer" onClick={() => handleSort('value')}>
                      Unit Cost & Total Value
                    </th>
                    <th className="py-3 px-4 cursor-pointer" onClick={() => handleSort('bbd')}>
                      Best Before Date (BBD)
                    </th>
                    <th className="py-3 px-4 text-center">Status / Risk</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 font-sans">
                  {sortedBatches.map((batch) => {
                    const daysRemaining = getDaysRemaining(batch.bestBeforeDate);
                    const riskLevel = getExpiryAlertLevel(batch.bestBeforeDate);
                    const skuObj = skus.find((s) => s.sku === batch.sku);
                    const totalVal = batch.quantityOnHand * batch.unitCost;

                    return (
                      <tr key={batch.id} className="hover:bg-slate-50 transition-colors">
                        <td className="py-3 px-4 font-mono font-bold whitespace-nowrap">
                          <div className="text-slate-900">{batch.batchNo}</div>
                          <div className="text-[10px] text-blue-700 font-normal">{batch.sku}</div>
                        </td>

                        <td className="py-3 px-4">
                          <div className="font-bold text-slate-900">{batch.itemName}</div>
                          <div className="text-[11px] text-slate-500">{skuObj?.category || 'General'}</div>
                        </td>

                        <td className="py-3 px-4 font-mono font-bold text-slate-800">
                          {batch.locationId}
                        </td>

                        <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">
                          {batch.quantityOnHand.toLocaleString()} <span className="text-[10px] text-slate-500 font-normal">{skuObj?.unit || 'units'}</span>
                        </td>

                        <td className="py-3 px-4 text-right font-mono">
                          <div className="font-bold text-emerald-700">
                            ${totalVal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </div>
                          <div className="text-[10px] text-slate-500">${batch.unitCost.toFixed(2)}/unit</div>
                        </td>

                        <td className="py-3 px-4 font-mono whitespace-nowrap">
                          <div className="font-bold text-slate-900">{batch.bestBeforeDate}</div>
                          <div className={`text-[10px] font-semibold ${
                            daysRemaining <= 14 ? 'text-rose-600' : daysRemaining <= 30 ? 'text-amber-600' : 'text-slate-500'
                          }`}>
                            {daysRemaining < 0 ? 'EXPIRED' : `${daysRemaining} days remaining`}
                          </div>
                        </td>

                        <td className="py-3 px-4 text-center whitespace-nowrap">
                          <div className="flex flex-col items-center gap-1">
                            {batch.status === 'QUARANTINED' ? (
                              <span className="px-2 py-0.5 bg-rose-100 text-rose-800 border border-rose-300 rounded-full text-[10px] font-bold">
                                QUARANTINED
                              </span>
                            ) : riskLevel === 'CRITICAL' ? (
                              <span className="px-2 py-0.5 bg-rose-100 text-rose-800 border border-rose-300 rounded-full text-[10px] font-bold">
                                CRITICAL EXpiry
                              </span>
                            ) : riskLevel === 'EXPIRING_SOON' ? (
                              <span className="px-2 py-0.5 bg-amber-100 text-amber-800 border border-amber-300 rounded-full text-[10px] font-bold">
                                EXPIRING SOON
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-full text-[10px] font-bold">
                                HEALTHY ACTIVE
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        )}

        {/* View Type 3: Stock Movements Report */}
        {reportType === 'STOCK_MOVEMENTS' && (
          filteredMovements.length === 0 ? (
            <div className="p-12 text-center text-slate-600">
              No stock movement logs found for the selected date window and search parameters.
            </div>
          ) : (
            <div className="overflow-x-auto max-h-[550px]">
              <table className="w-full text-left text-xs text-slate-700">
                <thead className="bg-slate-50 text-slate-600 uppercase font-mono border-b border-slate-200 text-[11px] sticky top-0">
                  <tr>
                    <th className="py-3 px-4">Timestamp & ID</th>
                    <th className="py-3 px-4">Action Type</th>
                    <th className="py-3 px-4">Batch & SKU</th>
                    <th className="py-3 px-4">Bin Location</th>
                    <th className="py-3 px-4 text-right">Quantity</th>
                    <th className="py-3 px-4">Operator</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 font-sans">
                  {filteredMovements.map((mov) => (
                    <tr key={mov.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-3 px-4 font-mono">
                        <div className="font-bold text-slate-900">{mov.timestamp}</div>
                        <div className="text-[10px] text-slate-500">{mov.id}</div>
                      </td>

                      <td className="py-3 px-4 font-mono font-bold">
                        <span className={`px-2 py-0.5 rounded text-[10px] ${
                          mov.type === 'INBOUND_RECEIVE'
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                            : mov.type === 'PICK_OUTBOUND'
                            ? 'bg-blue-100 text-blue-800 border border-blue-200'
                            : 'bg-amber-100 text-amber-800 border border-amber-200'
                        }`}>
                          {mov.type}
                        </span>
                      </td>

                      <td className="py-3 px-4 font-mono">
                        <div className="font-bold text-slate-900">{mov.batchNo}</div>
                        <div className="text-[10px] text-slate-500">{mov.sku}</div>
                      </td>

                      <td className="py-3 px-4 font-mono font-bold text-slate-800">
                        {mov.locationId}
                      </td>

                      <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">
                        {mov.type === 'PICK_OUTBOUND' ? `-${mov.quantity}` : `+${mov.quantity}`}
                      </td>

                      <td className="py-3 px-4 text-slate-800 font-semibold">
                        {mov.performedBy}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}

        {/* View Type 4: Low Stock & Reorder Plan */}
        {reportType === 'LOW_STOCK_REORDER' && (
          !enableSafetyReorder ? (
            <div className="p-12 text-center bg-slate-50 border border-slate-200 rounded-xl space-y-3">
              <ShieldAlert className="w-10 h-10 text-slate-400 mx-auto" />
              <div>
                <p className="text-slate-800 font-bold text-base">Safety Reorder Levels Feature is Disabled</p>
                <p className="text-slate-500 text-xs max-w-md mx-auto mt-1">
                  Safety reorder levels are currently turned OFF by Admin configuration. Reorder threshold calculations and automated recommendations are disabled.
                </p>
              </div>
              {currentUser.role === 'Admin' && onToggleSafetyReorder && (
                <button
                  onClick={() => onToggleSafetyReorder(true)}
                  className="inline-flex items-center space-x-2 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all cursor-pointer mt-2"
                >
                  <span>Tick to Enable Safety Reorder Levels</span>
                </button>
              )}
            </div>
          ) : filteredReorderSkus.length === 0 ? (
            <div className="p-12 text-center text-slate-600">
              No SKUs currently require reordering under the applied filter settings.
            </div>
          ) : (
            <div className="overflow-x-auto max-h-[550px]">
              <table className="w-full text-left text-xs text-slate-700">
                <thead className="bg-slate-50 text-slate-600 uppercase font-mono border-b border-slate-200 text-[11px] sticky top-0">
                  <tr>
                    <th className="py-3 px-4">SKU / Code</th>
                    <th className="py-3 px-4">Item Name & Category</th>
                    <th className="py-3 px-4 text-right">On-Hand Stock</th>
                    <th className="py-3 px-4 text-right">Reorder Threshold</th>
                    <th className="py-3 px-4 text-center">Status</th>
                    <th className="py-3 px-4 text-right">Recommended PO Qty</th>
                    <th className="py-3 px-4 text-right">Est. Cost ($)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 font-sans">
                  {filteredReorderSkus.map((sku) => {
                    const stock = skuStockMap.get(sku.sku)?.totalOnHand || 0;
                    const isLow = stock <= sku.reorderPoint;
                    const recQty = Math.max(50, Math.ceil((sku.reorderPoint * 2 - stock) / 25) * 25);
                    const matchingBatch = batches.find((b) => b.sku === sku.sku);
                    const unitCost = matchingBatch?.unitCost || 15.0;
                    const estCost = recQty * unitCost;

                    return (
                      <tr key={sku.sku} className="hover:bg-slate-50 transition-colors">
                        <td className="py-3 px-4 font-mono font-bold text-slate-900">
                          {sku.sku}
                        </td>

                        <td className="py-3 px-4">
                          <div className="font-bold text-slate-900">{sku.name}</div>
                          <div className="text-[11px] text-slate-500">{sku.category} • {sku.storageZone}</div>
                        </td>

                        <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">
                          {stock} <span className="text-[10px] text-slate-500 font-normal">{sku.unit}</span>
                        </td>

                        <td className="py-3 px-4 text-right font-mono font-bold text-amber-700">
                          {sku.reorderPoint} <span className="text-[10px] text-slate-500 font-normal">{sku.unit}</span>
                        </td>

                        <td className="py-3 px-4 text-center">
                          {isLow ? (
                            <span className="px-2 py-0.5 bg-amber-100 text-amber-800 border border-amber-300 rounded-full text-[10px] font-bold">
                              REORDER NEEDED
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-full text-[10px] font-bold">
                              HEALTHY STOCK
                            </span>
                          )}
                        </td>

                        <td className="py-3 px-4 text-right font-mono font-bold text-purple-700">
                          +{recQty} {sku.unit}
                        </td>

                        <td className="py-3 px-4 text-right font-mono font-bold text-emerald-700">
                          ${estCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        )}

      </div>

      {/* Printable Report Modal */}
      {showPrintModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-4xl w-full p-8 space-y-6 shadow-2xl text-slate-900 border border-slate-200 my-8">
            <div className="flex items-center justify-between border-b border-slate-200 pb-4">
              <div>
                <div className="flex items-center space-x-2 text-blue-600 font-bold text-xs uppercase">
                  <BarChart3 className="w-4 h-4" />
                  <span>ApexWMS Enterprise Official Report</span>
                </div>
                <h3 className="text-xl font-black text-slate-900 mt-1">
                  Inventory Report: {reportType.replace('_', ' ')}
                </h3>
              </div>
              <button
                onClick={() => setShowPrintModal(false)}
                className="text-slate-400 hover:text-slate-700 text-xl font-bold"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4 text-xs font-mono bg-slate-50 p-4 rounded-xl border border-slate-200">
              <div>
                <div><strong>Report Type:</strong> {reportType}</div>
                <div><strong>Generated By:</strong> {currentUser.name} ({currentUser.role})</div>
                <div><strong>Generated Time:</strong> {new Date().toLocaleString()}</div>
              </div>
              <div>
                <div><strong>Date Filter Window:</strong> {datePreset}</div>
                <div><strong>Date Range:</strong> {startDate || 'Start'} to {endDate || 'End'}</div>
                <div><strong>Target Date Field:</strong> {dateTargetField.toUpperCase()}</div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl">
                <div className="text-[10px] text-slate-500 uppercase font-bold">Total Filtered Batches</div>
                <div className="text-lg font-black text-blue-900">{metrics.totalLots}</div>
              </div>
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
                <div className="text-[10px] text-slate-500 uppercase font-bold">Total Valuation</div>
                <div className="text-lg font-black text-emerald-900">${metrics.totalValue.toLocaleString()}</div>
              </div>
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl">
                <div className="text-[10px] text-slate-500 uppercase font-bold">Critical Expiry Count</div>
                <div className="text-lg font-black text-rose-900">{metrics.criticalAlerts}</div>
              </div>
            </div>

            <div className="flex justify-end space-x-3 pt-4 border-t border-slate-200">
              <button
                onClick={() => setShowPrintModal(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs rounded-xl"
              >
                Close Preview
              </button>
              <button
                onClick={() => window.print()}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl shadow-xs flex items-center space-x-1.5"
              >
                <Printer className="w-4 h-4" />
                <span>Print / Save as PDF</span>
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
