import React, { useState, useMemo } from 'react';
import {
  Flame,
  AlertTriangle,
  Clock,
  DollarSign,
  Boxes,
  MapPin,
  ChevronRight,
  ShieldAlert,
  ArrowUpRight,
  Download,
  Search,
  Filter,
  CheckCircle2,
  Info,
  Layers,
  Thermometer,
  X,
  ExternalLink
} from 'lucide-react';
import { Batch, Location, StorageZone, ProductSKU } from '../types/wms';
import { INITIAL_ZONES } from '../data/initialData';

export interface ZoneExpiryHeatmapProps {
  batches: Batch[];
  locations: Location[];
  zones?: StorageZone[];
  skus?: ProductSKU[];
  onSelectZone?: (zoneCode: string) => void;
  onQuarantineBatch?: (batchId: string) => void;
}

export type HeatmapMetricMode = 'VALUE_AT_RISK' | 'BATCH_COUNT' | 'UNITS_AT_RISK' | 'EARLIEST_DAYS';
export type ExpiryHorizonFilter = 'ALL' | 'CRITICAL_14D' | 'WARNING_30D' | 'WATCH_60D';

export interface ZoneExpiryData {
  zoneCode: string;
  zoneTitle: string;
  aisle: string;
  temperatureRange: string;
  icon: string;
  themeColor: string;
  totalBatches: number;
  totalUnits: number;
  totalValuation: number;
  criticalBatches: Batch[];
  warningBatches: Batch[];
  watchBatches: Batch[];
  healthyBatches: Batch[];
  valueAtRisk30d: number;
  unitsAtRisk30d: number;
  batchesAtRisk30d: number;
  earliestDaysToExpiry: number;
  earliestBatch: Batch | null;
  riskLevel: 'CRITICAL' | 'HIGH' | 'MODERATE' | 'HEALTHY' | 'EMPTY';
  binBreakdown: Array<{
    locationId: string;
    batches: Batch[];
    earliestDays: number;
    valueAtRisk: number;
    riskLevel: 'CRITICAL' | 'HIGH' | 'MODERATE' | 'HEALTHY' | 'EMPTY';
  }>;
}

export const ZoneExpiryHeatmap: React.FC<ZoneExpiryHeatmapProps> = ({
  batches,
  locations,
  zones = INITIAL_ZONES,
  skus = [],
  onSelectZone,
  onQuarantineBatch
}) => {
  const [metricMode, setMetricMode] = useState<HeatmapMetricMode>('VALUE_AT_RISK');
  const [horizonFilter, setHorizonFilter] = useState<ExpiryHorizonFilter>('ALL');
  const [selectedZoneCode, setSelectedZoneCode] = useState<string | null>(null);
  const [searchLotQuery, setSearchLotQuery] = useState('');
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  // Helper: calculate days to expiry relative to current date
  const getDaysToExpiry = (bestBeforeDate: string): number => {
    if (!bestBeforeDate) return 999;
    // Whole calendar days (today = 0), same rule as the service: stock is expired only after its date.
    const [y, m, d] = bestBeforeDate.slice(0, 10).split('-').map(Number);
    if (!y || !m || !d) return 999;
    const t = new Date();
    const today = Date.UTC(t.getFullYear(), t.getMonth(), t.getDate());
    return Math.round((Date.UTC(y, m - 1, d) - today) / 86400000);
  };

  // Compile zone analytics and heatmap grid data
  const zoneAnalytics = useMemo(() => {
    const activeZones = zones && zones.length > 0 ? zones : INITIAL_ZONES;

    const data: ZoneExpiryData[] = activeZones.map((z) => {
      // Find all locations belonging to this zone
      const zoneLocations = locations.filter((loc) => loc.zone === z.code);
      const zoneLocIds = new Set(zoneLocations.map((loc) => loc.id));

      // Find all batches stored in these locations
      const zoneBatches = batches.filter((b) => zoneLocIds.has(b.locationId) && (b.quantityOnHand || 0) > 0);

      const criticalBatches: Batch[] = [];
      const warningBatches: Batch[] = [];
      const watchBatches: Batch[] = [];
      const healthyBatches: Batch[] = [];

      let valueAtRisk30d = 0;
      let unitsAtRisk30d = 0;
      let totalValuation = 0;
      let totalUnits = 0;
      let earliestDaysToExpiry = 9999;
      let earliestBatch: Batch | null = null;

      zoneBatches.forEach((b) => {
        const days = getDaysToExpiry(b.bestBeforeDate);
        const qty = b.quantityOnHand || 0;
        const val = qty * (b.unitCost || 0);
        totalValuation += val;
        totalUnits += qty;

        if (days < earliestDaysToExpiry) {
          earliestDaysToExpiry = days;
          earliestBatch = b;
        }

        if (days <= 14) {
          criticalBatches.push(b);
          valueAtRisk30d += val;
          unitsAtRisk30d += qty;
        } else if (days <= 30) {
          warningBatches.push(b);
          valueAtRisk30d += val;
          unitsAtRisk30d += qty;
        } else if (days <= 60) {
          watchBatches.push(b);
        } else {
          healthyBatches.push(b);
        }
      });

      // Compute bin-level breakdown for the micro-map
      const binBreakdown = zoneLocations.map((loc) => {
        const binBatches = zoneBatches.filter((b) => b.locationId === loc.id);
        let binEarliest = 9999;
        let binRiskVal = 0;

        binBatches.forEach((bb) => {
          const d = getDaysToExpiry(bb.bestBeforeDate);
          if (d < binEarliest) binEarliest = d;
          if (d <= 30) {
            binRiskVal += (bb.quantityOnHand || 0) * (bb.unitCost || 0);
          }
        });

        let binRiskLevel: 'CRITICAL' | 'HIGH' | 'MODERATE' | 'HEALTHY' | 'EMPTY' = 'EMPTY';
        if (binBatches.length > 0) {
          if (binEarliest <= 14) binRiskLevel = 'CRITICAL';
          else if (binEarliest <= 30) binRiskLevel = 'HIGH';
          else if (binEarliest <= 60) binRiskLevel = 'MODERATE';
          else binRiskLevel = 'HEALTHY';
        }

        return {
          locationId: loc.id,
          batches: binBatches,
          earliestDays: binEarliest === 9999 ? 0 : binEarliest,
          valueAtRisk: binRiskVal,
          riskLevel: binRiskLevel
        };
      });

      // Determine overall zone risk level
      let riskLevel: 'CRITICAL' | 'HIGH' | 'MODERATE' | 'HEALTHY' | 'EMPTY' = 'EMPTY';
      if (zoneBatches.length === 0) {
        riskLevel = 'EMPTY';
      } else if (criticalBatches.length > 0 || earliestDaysToExpiry <= 14) {
        riskLevel = 'CRITICAL';
      } else if (warningBatches.length > 0 || earliestDaysToExpiry <= 30) {
        riskLevel = 'HIGH';
      } else if (watchBatches.length > 0 || earliestDaysToExpiry <= 60) {
        riskLevel = 'MODERATE';
      } else {
        riskLevel = 'HEALTHY';
      }

      return {
        zoneCode: z.code,
        zoneTitle: z.title || z.code,
        aisle: z.aisle || 'Central Aisle',
        temperatureRange: z.temperatureRange || 'Standard Storage',
        icon: z.icon || '📦',
        themeColor: z.themeColor || 'slate',
        totalBatches: zoneBatches.length,
        totalUnits,
        totalValuation,
        criticalBatches,
        warningBatches,
        watchBatches,
        healthyBatches,
        valueAtRisk30d,
        unitsAtRisk30d,
        batchesAtRisk30d: criticalBatches.length + warningBatches.length,
        earliestDaysToExpiry: earliestDaysToExpiry === 9999 ? 0 : earliestDaysToExpiry,
        earliestBatch,
        riskLevel,
        binBreakdown
      };
    });

    return data;
  }, [zones, locations, batches]);

  // Overall Warehouse Stock Loss Metrics
  const summaryMetrics = useMemo(() => {
    let totalValueAtRisk = 0;
    let totalCriticalLots = 0;
    let totalExpiringSoonLots = 0;
    let totalUnitsAtRisk = 0;
    let highestRiskZone: ZoneExpiryData | null = null;
    let maxExposure = -1;

    zoneAnalytics.forEach((za) => {
      totalValueAtRisk += za.valueAtRisk30d;
      totalCriticalLots += za.criticalBatches.length;
      totalExpiringSoonLots += za.warningBatches.length;
      totalUnitsAtRisk += za.unitsAtRisk30d;

      if (za.valueAtRisk30d > maxExposure) {
        maxExposure = za.valueAtRisk30d;
        highestRiskZone = za;
      }
    });

    return {
      totalValueAtRisk,
      totalCriticalLots,
      totalExpiringSoonLots,
      totalUnitsAtRisk,
      highestRiskZone
    };
  }, [zoneAnalytics]);

  // Filtered zones based on horizon filter
  const filteredZones = useMemo(() => {
    return zoneAnalytics.filter((z) => {
      if (horizonFilter === 'CRITICAL_14D') return z.criticalBatches.length > 0 || z.riskLevel === 'CRITICAL';
      if (horizonFilter === 'WARNING_30D') return z.batchesAtRisk30d > 0;
      if (horizonFilter === 'WATCH_60D') return z.criticalBatches.length > 0 || z.warningBatches.length > 0 || z.watchBatches.length > 0;
      return true;
    });
  }, [zoneAnalytics, horizonFilter]);

  // Active inspected zone data
  const inspectedZone = useMemo(() => {
    if (!selectedZoneCode) return null;
    return zoneAnalytics.find((z) => z.zoneCode === selectedZoneCode) || null;
  }, [zoneAnalytics, selectedZoneCode]);

  // Filtered batches for the active inspected zone
  const inspectedZoneBatches = useMemo(() => {
    if (!inspectedZone) return [];
    const all = [
      ...inspectedZone.criticalBatches,
      ...inspectedZone.warningBatches,
      ...inspectedZone.watchBatches,
      ...inspectedZone.healthyBatches
    ];

    // Sort: Critical first, then by days remaining ascending
    all.sort((a, b) => getDaysToExpiry(a.bestBeforeDate) - getDaysToExpiry(b.bestBeforeDate));

    if (!searchLotQuery.trim()) return all;
    const q = searchLotQuery.toLowerCase();
    return all.filter(
      (b) =>
        b.batchNo.toLowerCase().includes(q) ||
        b.sku.toLowerCase().includes(q) ||
        b.itemName.toLowerCase().includes(q) ||
        b.locationId.toLowerCase().includes(q)
    );
  }, [inspectedZone, searchLotQuery]);

  // Heatmap Color Scales
  const getHeatmapColorClasses = (risk: 'CRITICAL' | 'HIGH' | 'MODERATE' | 'HEALTHY' | 'EMPTY') => {
    switch (risk) {
      case 'CRITICAL':
        return {
          bg: 'bg-gradient-to-br from-rose-500/20 via-rose-500/10 to-rose-950/20',
          border: 'border-rose-500 ring-1 ring-rose-500/40',
          badgeBg: 'bg-rose-100 text-rose-800 border-rose-300',
          indicator: 'bg-rose-500',
          label: 'Critical Hazard (<14d)'
        };
      case 'HIGH':
        return {
          bg: 'bg-gradient-to-br from-orange-500/20 via-orange-500/10 to-amber-950/20',
          border: 'border-orange-500 ring-1 ring-orange-500/30',
          badgeBg: 'bg-orange-100 text-orange-800 border-orange-300',
          indicator: 'bg-orange-500',
          label: 'High Risk (15-30d)'
        };
      case 'MODERATE':
        return {
          bg: 'bg-gradient-to-br from-amber-400/20 via-yellow-400/10 to-slate-900/10',
          border: 'border-amber-400/60',
          badgeBg: 'bg-amber-100 text-amber-800 border-amber-300',
          indicator: 'bg-amber-400',
          label: 'Moderate Watch (31-60d)'
        };
      case 'HEALTHY':
        return {
          bg: 'bg-gradient-to-br from-emerald-500/15 via-emerald-500/5 to-slate-50',
          border: 'border-emerald-300/80',
          badgeBg: 'bg-emerald-100 text-emerald-800 border-emerald-300',
          indicator: 'bg-emerald-500',
          label: 'Optimal Shelf Life (>60d)'
        };
      case 'EMPTY':
      default:
        return {
          bg: 'bg-slate-50',
          border: 'border-slate-200',
          badgeBg: 'bg-slate-100 text-slate-600 border-slate-300',
          indicator: 'bg-slate-300',
          label: 'Empty Storage'
        };
    }
  };

  // Export Zone Expiry CSV
  const handleExportZoneCsv = (zone: ZoneExpiryData) => {
    const rows = [
      ['Zone Code', 'Zone Title', 'Batch No', 'SKU', 'Item Name', 'Location', 'Best Before Date', 'Days Remaining', 'Qty On Hand', 'Unit Cost', 'Value At Risk ($)', 'Status']
    ];

    const allBatches = [
      ...zone.criticalBatches,
      ...zone.warningBatches,
      ...zone.watchBatches,
      ...zone.healthyBatches
    ];

    allBatches.forEach((b) => {
      const days = getDaysToExpiry(b.bestBeforeDate);
      const val = (b.quantityOnHand || 0) * (b.unitCost || 0);
      rows.push([
        zone.zoneCode,
        zone.zoneTitle,
        b.batchNo,
        b.sku,
        `"${b.itemName.replace(/"/g, '""')}"`,
        b.locationId,
        b.bestBeforeDate,
        String(days),
        String(b.quantityOnHand),
        String(b.unitCost),
        val.toFixed(2),
        b.status
      ]);
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + rows.map((e) => e.join(',')).join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Expiry_Risk_Heatmap_${zone.zoneCode}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setActionNotice(`📥 Exported expiry risk report for ${zone.zoneTitle}`);
    setTimeout(() => setActionNotice(null), 3500);
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-xs space-y-6">
      
      {/* 1. Header & Heatmap Description */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <div className="flex items-center space-x-2 text-rose-600 font-bold text-xs uppercase tracking-wider mb-1">
            <Flame className="w-4 h-4 text-rose-500 animate-pulse" />
            <span>Thermal Expiry Risk Heatmap • FEFO Prioritization</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight flex items-center space-x-2">
            <span>Warehouse Zone Batch Expiry Heatmap</span>
          </h2>
          <p className="text-xs text-slate-500 mt-1 max-w-2xl">
            Real-time thermographic loss distribution across warehouse bays. Identifies inventory hotspots nearing shelf-life expiration to prevent write-offs and enforce First-Expired, First-Out (FEFO) order allocations.
          </p>
        </div>

        {/* Heatmap Metric & Horizon Toggles */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Metric Selector */}
          <div className="flex items-center space-x-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200">
            <button
              type="button"
              onClick={() => setMetricMode('VALUE_AT_RISK')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center space-x-1 ${
                metricMode === 'VALUE_AT_RISK'
                  ? 'bg-rose-600 text-white shadow-xs'
                  : 'text-slate-700 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
              title="Show financial dollar value of lots expiring within 30 days"
            >
              <DollarSign className="w-3.5 h-3.5" />
              <span>Loss Exposure ($)</span>
            </button>

            <button
              type="button"
              onClick={() => setMetricMode('BATCH_COUNT')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center space-x-1 ${
                metricMode === 'BATCH_COUNT'
                  ? 'bg-rose-600 text-white shadow-xs'
                  : 'text-slate-700 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
              title="Show number of expiring batch lots per zone"
            >
              <Boxes className="w-3.5 h-3.5" />
              <span>At-Risk Lots</span>
            </button>

            <button
              type="button"
              onClick={() => setMetricMode('UNITS_AT_RISK')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center space-x-1 ${
                metricMode === 'UNITS_AT_RISK'
                  ? 'bg-rose-600 text-white shadow-xs'
                  : 'text-slate-700 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
              title="Show physical unit/carton volume at risk"
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Units / Cartons</span>
            </button>
          </div>

          {/* Time Horizon Filter */}
          <div className="flex items-center space-x-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200">
            <Filter className="w-3.5 h-3.5 text-slate-500 ml-1.5" />
            <select
              value={horizonFilter}
              onChange={(e) => setHorizonFilter(e.target.value as ExpiryHorizonFilter)}
              className="bg-transparent text-xs font-semibold text-slate-800 pr-2 py-1 focus:outline-none cursor-pointer"
            >
              <option value="ALL">All Horizons (0 - 365d)</option>
              <option value="CRITICAL_14D">Critical Only (&le; 14 Days)</option>
              <option value="WARNING_30D">Near-Term (&le; 30 Days)</option>
              <option value="WATCH_60D">Quarterly Watch (&le; 60 Days)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Action Notification Toast */}
      {actionNotice && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-400 rounded-xl text-xs font-semibold text-emerald-800 flex items-center space-x-2 animate-fadeIn">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
          <span>{actionNotice}</span>
        </div>
      )}

      {/* 2. Executive Stock Loss KPI Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
        
        {/* KPI 1: Value At Risk */}
        <div className="bg-rose-50/70 border border-rose-200 rounded-xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-rose-800 font-bold uppercase tracking-wider">
            <span>Total Stock Loss Exposure</span>
            <DollarSign className="w-4 h-4 text-rose-600" />
          </div>
          <div className="my-1.5">
            <span className="text-2xl sm:text-3xl font-black text-rose-900 font-mono">
              ${summaryMetrics.totalValueAtRisk.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
          <div className="text-[11px] text-rose-700 font-medium">
            Across batches expiring in &le;30 days
          </div>
        </div>

        {/* KPI 2: Critical Lots Count */}
        <div className="bg-amber-50/80 border border-amber-200 rounded-xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-amber-800 font-bold uppercase tracking-wider">
            <span>Critical Lots (&le;14d)</span>
            <AlertTriangle className="w-4 h-4 text-amber-600" />
          </div>
          <div className="my-1.5 flex items-baseline space-x-2">
            <span className="text-2xl sm:text-3xl font-black text-amber-900 font-mono">
              {summaryMetrics.totalCriticalLots}
            </span>
            <span className="text-xs text-amber-700 font-bold font-mono">
              +{summaryMetrics.totalExpiringSoonLots} in 15-30d
            </span>
          </div>
          <div className="text-[11px] text-amber-800 font-medium">
            Immediate FEFO dispatch required
          </div>
        </div>

        {/* KPI 3: Units / Cartons in Jeopardy */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-slate-600 font-bold uppercase tracking-wider">
            <span>Physical Volume at Risk</span>
            <Boxes className="w-4 h-4 text-slate-500" />
          </div>
          <div className="my-1.5">
            <span className="text-2xl sm:text-3xl font-black text-slate-900 font-mono">
              {summaryMetrics.totalUnitsAtRisk.toLocaleString()}
            </span>
            <span className="text-xs text-slate-500 ml-1 font-semibold">ctn/units</span>
          </div>
          <div className="text-[11px] text-slate-500 font-medium">
            Subject to expedited markdown/pick
          </div>
        </div>

        {/* KPI 4: Highest Loss Hotspot Zone */}
        <div className="bg-blue-50/70 border border-blue-200 rounded-xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-blue-800 font-bold uppercase tracking-wider">
            <span>Primary Hazard Hotspot</span>
            <MapPin className="w-4 h-4 text-blue-600" />
          </div>
          <div className="my-1.5">
            <div className="text-lg sm:text-xl font-black text-blue-950 truncate">
              {summaryMetrics.highestRiskZone ? summaryMetrics.highestRiskZone.zoneTitle : 'All Zones Clear'}
            </div>
          </div>
          <div className="text-[11px] text-blue-800 font-semibold font-mono">
            {summaryMetrics.highestRiskZone && summaryMetrics.highestRiskZone.valueAtRisk30d > 0
              ? `$${summaryMetrics.highestRiskZone.valueAtRisk30d.toLocaleString()} at risk`
              : 'Zero active risk'}
          </div>
        </div>

      </div>

      {/* 3. Heatmap Legend & Color Code Scale */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold">
        <div className="flex items-center space-x-2 text-slate-700">
          <span className="font-bold text-slate-900">Thermal Heatmap Legend:</span>
          <span className="text-slate-400 font-normal">Color intensity reflects shelf-life expiration proximity</span>
        </div>

        <div className="flex flex-wrap items-center gap-3 font-mono text-[11px]">
          <div className="flex items-center space-x-1.5">
            <span className="w-3.5 h-3.5 rounded bg-rose-500 ring-2 ring-rose-300 animate-pulse"></span>
            <span className="text-rose-900 font-bold">Critical Hazard (&le;14d / Expired)</span>
          </div>

          <div className="flex items-center space-x-1.5">
            <span className="w-3.5 h-3.5 rounded bg-orange-500 ring-1 ring-orange-300"></span>
            <span className="text-orange-900 font-bold">High Risk (15-30d)</span>
          </div>

          <div className="flex items-center space-x-1.5">
            <span className="w-3.5 h-3.5 rounded bg-amber-400 ring-1 ring-amber-300"></span>
            <span className="text-amber-900 font-bold">Watchlist (31-60d)</span>
          </div>

          <div className="flex items-center space-x-1.5">
            <span className="w-3.5 h-3.5 rounded bg-emerald-500 ring-1 ring-emerald-300"></span>
            <span className="text-emerald-900 font-bold">Stable (&gt;60d Fresh)</span>
          </div>

          <div className="flex items-center space-x-1.5">
            <span className="w-3.5 h-3.5 rounded bg-slate-200 border border-slate-300"></span>
            <span className="text-slate-500">Empty / Clear</span>
          </div>
        </div>
      </div>

      {/* 4. Spatial Zone Heatmap Tiles Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {filteredZones.map((zone) => {
          const colorStyles = getHeatmapColorClasses(zone.riskLevel);
          const isSelected = selectedZoneCode === zone.zoneCode;

          // Main Metric Display
          let mainMetricValue = '';
          let subMetricLabel = '';

          if (metricMode === 'VALUE_AT_RISK') {
            mainMetricValue = `$${zone.valueAtRisk30d.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
            subMetricLabel = 'Stock Value at Risk (<30d)';
          } else if (metricMode === 'BATCH_COUNT') {
            mainMetricValue = `${zone.batchesAtRisk30d} lots`;
            subMetricLabel = `out of ${zone.totalBatches} total lots`;
          } else if (metricMode === 'UNITS_AT_RISK') {
            mainMetricValue = `${zone.unitsAtRisk30d.toLocaleString()} ctn`;
            subMetricLabel = `out of ${zone.totalUnits.toLocaleString()} units`;
          } else {
            mainMetricValue = zone.earliestDaysToExpiry > 0 ? `${zone.earliestDaysToExpiry} days` : 'No Expiry';
            subMetricLabel = 'Earliest Batch Expiry';
          }

          // Percentage breakdown calculation for progress bar
          const totalLots = Math.max(1, zone.totalBatches);
          const critPct = Math.round((zone.criticalBatches.length / totalLots) * 100);
          const warnPct = Math.round((zone.warningBatches.length / totalLots) * 100);
          const watchPct = Math.round((zone.watchBatches.length / totalLots) * 100);
          const healthyPct = Math.max(0, 100 - critPct - warnPct - watchPct);

          return (
            <div
              key={zone.zoneCode}
              onClick={() => setSelectedZoneCode(isSelected ? null : zone.zoneCode)}
              className={`relative rounded-2xl border-2 transition-all cursor-pointer p-4.5 flex flex-col justify-between overflow-hidden group shadow-2xs hover:shadow-md ${
                colorStyles.bg
              } ${isSelected ? 'border-blue-600 ring-4 ring-blue-500/20 scale-[1.02]' : colorStyles.border}`}
            >
              {/* Top Row: Zone Header & Risk Indicator */}
              <div>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center space-x-2">
                    <span className="text-xl p-1 bg-white/80 rounded-lg shadow-2xs backdrop-blur-xs">
                      {zone.icon}
                    </span>
                    <div>
                      <h4 className="font-extrabold text-sm text-slate-900 group-hover:text-blue-700 transition-colors leading-tight">
                        {zone.zoneTitle}
                      </h4>
                      <span className="text-[10px] font-mono font-semibold text-slate-500">
                        {zone.aisle} • {zone.zoneCode}
                      </span>
                    </div>
                  </div>

                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border shadow-2xs ${colorStyles.badgeBg}`}>
                    {zone.riskLevel}
                  </span>
                </div>

                {/* Temperature Condition Pill */}
                <div className="flex items-center space-x-1.5 text-[11px] text-slate-600 mb-3 bg-white/60 px-2.5 py-1 rounded-lg border border-slate-200/60 font-mono">
                  <Thermometer className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" />
                  <span className="truncate">{zone.temperatureRange}</span>
                </div>

                {/* Primary Metric Number Display */}
                <div className="p-3 bg-white/90 rounded-xl border border-slate-200/90 shadow-2xs mb-3">
                  <div className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                    {subMetricLabel}
                  </div>
                  <div className={`text-2xl font-black font-mono tracking-tight mt-0.5 ${
                    zone.riskLevel === 'CRITICAL' ? 'text-rose-700' : zone.riskLevel === 'HIGH' ? 'text-orange-700' : 'text-slate-900'
                  }`}>
                    {mainMetricValue}
                  </div>
                  
                  {/* Earliest Lot Indicator */}
                  {zone.earliestBatch ? (
                    <div className="mt-1.5 pt-1.5 border-t border-slate-100 flex items-center justify-between text-[10px] font-mono text-slate-600">
                      <span className="truncate max-w-[110px]" title={zone.earliestBatch.batchNo}>
                        {zone.earliestBatch.batchNo}
                      </span>
                      <span className={`font-bold ${zone.earliestDaysToExpiry <= 14 ? 'text-rose-700' : 'text-slate-700'}`}>
                        {zone.earliestDaysToExpiry <= 0 ? 'EXPIRED' : `${zone.earliestDaysToExpiry}d remaining`}
                      </span>
                    </div>
                  ) : (
                    <div className="mt-1.5 pt-1.5 border-t border-slate-100 text-[10px] font-mono text-slate-400 italic">
                      No active lots stored
                    </div>
                  )}
                </div>

                {/* Risk Distribution Proportional Bar */}
                <div className="space-y-1 mb-3">
                  <div className="flex justify-between text-[10px] font-mono text-slate-500 font-semibold">
                    <span>Batch Risk Mix</span>
                    <span>{zone.totalBatches} Lots Total</span>
                  </div>
                  <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden flex">
                    {critPct > 0 && <div style={{ width: `${critPct}%` }} className="bg-rose-500 h-full" title={`Critical: ${critPct}%`} />}
                    {warnPct > 0 && <div style={{ width: `${warnPct}%` }} className="bg-orange-500 h-full" title={`High Risk: ${warnPct}%`} />}
                    {watchPct > 0 && <div style={{ width: `${watchPct}%` }} className="bg-amber-400 h-full" title={`Watchlist: ${watchPct}%`} />}
                    {healthyPct > 0 && <div style={{ width: `${healthyPct}%` }} className="bg-emerald-500 h-full" title={`Healthy: ${healthyPct}%`} />}
                  </div>
                </div>

                {/* Physical Bin Micro-Grid Preview */}
                <div className="space-y-1">
                  <div className="text-[10px] font-mono text-slate-500 font-semibold">
                    Storage Bins Heatmap ({zone.binBreakdown.length} bins)
                  </div>
                  <div className="grid grid-cols-6 gap-1 p-1.5 bg-white/80 rounded-lg border border-slate-200/80">
                    {zone.binBreakdown.map((bin) => {
                      let binBg = 'bg-slate-200';
                      if (bin.riskLevel === 'CRITICAL') binBg = 'bg-rose-500 ring-1 ring-rose-300';
                      else if (bin.riskLevel === 'HIGH') binBg = 'bg-orange-500';
                      else if (bin.riskLevel === 'MODERATE') binBg = 'bg-amber-400';
                      else if (bin.riskLevel === 'HEALTHY') binBg = 'bg-emerald-500';

                      return (
                        <div
                          key={bin.locationId}
                          title={`${bin.locationId}: ${bin.batches.length} lots, Risk: ${bin.riskLevel}${bin.valueAtRisk > 0 ? ` ($${bin.valueAtRisk.toFixed(0)})` : ''}`}
                          className={`h-4 rounded-xs transition-transform hover:scale-125 ${binBg}`}
                        />
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Bottom Card Footer: Click to inspect */}
              <div className="mt-4 pt-2.5 border-t border-slate-200/80 flex items-center justify-between text-xs font-bold text-slate-700">
                <span className="text-[11px] font-mono text-slate-500">
                  {zone.totalValuation > 0 ? `$${zone.totalValuation.toLocaleString('en-US', { maximumFractionDigits: 0 })} Total` : '$0.00'}
                </span>
                <span className="flex items-center space-x-1 text-blue-700 text-xs font-bold group-hover:translate-x-0.5 transition-transform">
                  <span>{isSelected ? 'Close View' : 'Inspect Lots'}</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* 5. Detailed Inspection Drawer / Panel for the Selected Zone */}
      {inspectedZone && (
        <div className="bg-slate-50 border-2 border-blue-500/50 rounded-2xl p-5 shadow-sm space-y-4 animate-fadeIn">
          
          {/* Header of Drawer */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200">
            <div className="flex items-center space-x-3">
              <span className="text-2xl p-2 bg-white rounded-xl border border-slate-200 shadow-2xs">
                {inspectedZone.icon}
              </span>
              <div>
                <div className="flex items-center space-x-2">
                  <h3 className="text-lg font-black text-slate-900">
                    {inspectedZone.zoneTitle} — Batch Expiry Inspection
                  </h3>
                  <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase border ${getHeatmapColorClasses(inspectedZone.riskLevel).badgeBg}`}>
                    {inspectedZone.riskLevel}
                  </span>
                </div>
                <p className="text-xs text-slate-500 font-mono mt-0.5">
                  Aisle: <strong>{inspectedZone.aisle}</strong> • Temperature: <strong>{inspectedZone.temperatureRange}</strong> • At-Risk Value: <strong className="text-rose-700">${inspectedZone.valueAtRisk30d.toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong>
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <button
                onClick={() => handleExportZoneCsv(inspectedZone)}
                className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all flex items-center space-x-1.5 shadow-xs cursor-pointer"
                title="Export zone batch audit to CSV"
              >
                <Download className="w-3.5 h-3.5 text-amber-400" />
                <span>Export Zone CSV</span>
              </button>

              <button
                onClick={() => setSelectedZoneCode(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
                title="Close inspection panel"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Search bar inside drawer */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search by SKU, Batch Lot #, Description, Bin..."
                value={searchLotQuery}
                onChange={(e) => setSearchLotQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-500 font-medium"
              />
            </div>

            <div className="flex items-center space-x-2 text-xs font-mono text-slate-600">
              <span className="font-bold text-slate-900">{inspectedZoneBatches.length}</span> batches located in {inspectedZone.zoneCode}
            </div>
          </div>

          {/* Batches Table for Inspected Zone */}
          <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-2xs">
            <div className="overflow-x-auto max-h-[360px]">
              <table className="w-full text-left text-xs text-slate-700">
                <thead className="bg-slate-100 text-slate-700 uppercase font-mono border-b border-slate-200 text-[11px] sticky top-0">
                  <tr>
                    <th className="py-2.5 px-4">Batch Lot No</th>
                    <th className="py-2.5 px-4">SKU & Item Name</th>
                    <th className="py-2.5 px-4">Bin Location</th>
                    <th className="py-2.5 px-4">Best Before Date</th>
                    <th className="py-2.5 px-4 text-center">Days to Expiry</th>
                    <th className="py-2.5 px-4 text-right">Units on Hand</th>
                    <th className="py-2.5 px-4 text-right">Total Exposure ($)</th>
                    <th className="py-2.5 px-4 text-center">FEFO Action Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-sans">
                  {inspectedZoneBatches.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="text-center py-8 text-slate-400 italic">
                        No batch lots found matching criteria in this zone.
                      </td>
                    </tr>
                  ) : (
                    inspectedZoneBatches.map((batch) => {
                      const days = getDaysToExpiry(batch.bestBeforeDate);
                      const isExpired = days < 0;
                      const isCritical = days > 0 && days <= 14;
                      const isWarning = days > 14 && days <= 30;
                      const isWatch = days > 30 && days <= 60;
                      const lossVal = (batch.quantityOnHand || 0) * (batch.unitCost || 0);

                      let statusBadge = (
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                          Fresh Stock
                        </span>
                      );

                      if (isExpired) {
                        statusBadge = (
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-rose-600 text-white shadow-2xs animate-pulse">
                            Expired Lot
                          </span>
                        );
                      } else if (isCritical) {
                        statusBadge = (
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-rose-100 text-rose-900 border border-rose-300">
                            Urgent FEFO Pick
                          </span>
                        );
                      } else if (isWarning) {
                        statusBadge = (
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-orange-100 text-orange-900 border border-orange-300">
                            Expiring &le;30d
                          </span>
                        );
                      } else if (isWatch) {
                        statusBadge = (
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-amber-100 text-amber-900 border border-amber-300">
                            Watchlist &le;60d
                          </span>
                        );
                      }

                      return (
                        <tr
                          key={batch.id}
                          className={`hover:bg-slate-50 transition-colors ${
                            isExpired || isCritical ? 'bg-rose-50/40' : isWarning ? 'bg-orange-50/20' : ''
                          }`}
                        >
                          <td className="py-2.5 px-4 font-mono font-bold text-slate-900">
                            <div>{batch.batchNo}</div>
                            <div className="text-[10px] text-slate-400 font-normal">{batch.id}</div>
                          </td>

                          <td className="py-2.5 px-4">
                            <div className="font-bold text-slate-900">{batch.itemName}</div>
                            <div className="text-[11px] text-blue-700 font-mono">{batch.sku}</div>
                          </td>

                          <td className="py-2.5 px-4 font-mono font-bold text-slate-800">
                            <span className="px-2 py-0.5 rounded bg-slate-100 border border-slate-200 text-blue-700">
                              {batch.locationId}
                            </span>
                          </td>

                          <td className="py-2.5 px-4 font-mono font-semibold text-slate-900">
                            {batch.bestBeforeDate}
                          </td>

                          <td className="py-2.5 px-4 text-center font-mono font-bold">
                            <span className={`px-2 py-0.5 rounded text-[11px] ${
                              isExpired
                                ? 'bg-rose-600 text-white font-black'
                                : isCritical
                                ? 'bg-rose-100 text-rose-800 border border-rose-300'
                                : isWarning
                                ? 'bg-orange-100 text-orange-800'
                                : isWatch
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-slate-100 text-slate-700'
                            }`}>
                              {isExpired ? 'EXPIRED' : `${days} days`}
                            </span>
                          </td>

                          <td className="py-2.5 px-4 text-right font-mono font-bold text-slate-900">
                            {batch.quantityOnHand.toLocaleString()}
                          </td>

                          <td className="py-2.5 px-4 text-right font-mono font-bold text-slate-900">
                            <span className={lossVal > 0 && (isCritical || isWarning) ? 'text-rose-700' : 'text-slate-700'}>
                              ${lossVal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                          </td>

                          <td className="py-2.5 px-4 text-center whitespace-nowrap">
                            {statusBadge}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between text-xs text-slate-500 font-mono gap-2 pt-1">
            <span className="flex items-center space-x-1">
              <Info className="w-3.5 h-3.5 text-blue-600" />
              <span>FEFO picks must prioritize lots with shortest remaining shelf-life to avoid warehouse shrink.</span>
            </span>
            <span>
              Total zone valuation: <strong>${inspectedZone.totalValuation.toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong>
            </span>
          </div>

        </div>
      )}

    </div>
  );
};
