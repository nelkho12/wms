import React, { useState, useMemo, useEffect } from 'react';
import {
  Boxes,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Clock,
  MapPin,
  RefreshCw,
  Zap,
  CheckCircle2,
  DollarSign,
  ShoppingCart,
  ShieldAlert,
  Layers,
  Search,
  ArrowUpRight,
  ArrowDownLeft,
  Calendar,
  Filter,
  Package,
  Activity,
  PlusCircle,
  Truck,
  Settings
} from 'lucide-react';
import { ProductSKU, Batch, Location, StockMovement, ZoneType, PurchaseOrder, StorageZone } from '../types/wms';
import { UserProfile } from '../types/roles';
import { receiveInboundStock, fetchPurchaseOrders, createPurchaseOrder } from '../services/api';
import { INITIAL_ZONES } from '../data/initialData';

interface RealtimeDashboardProps {
  skus: ProductSKU[];
  batches: Batch[];
  locations: Location[];
  zones?: StorageZone[];
  stockMovements: StockMovement[];
  currentUser: UserProfile;
  onRefresh: () => void;
  onLogAuditActivity?: (
    actionCategory: any,
    actionType: string,
    targetEntity: string,
    details: string,
    severity?: 'INFO' | 'WARNING' | 'CRITICAL'
  ) => void;
  onOpenInboundModal?: () => void;
  enableSafetyReorder?: boolean;
  onToggleSafetyReorder?: (enabled: boolean) => void;
  onNavigateToFacilityLayout?: () => void;
}

export const RealtimeDashboard: React.FC<RealtimeDashboardProps> = ({
  skus,
  batches,
  locations,
  zones,
  stockMovements,
  currentUser,
  onRefresh,
  onLogAuditActivity,
  onOpenInboundModal,
  enableSafetyReorder = true,
  onToggleSafetyReorder,
  onNavigateToFacilityLayout
}) => {
  // Live Clock state for real-time ticker
  const [liveTimestamp, setLiveTimestamp] = useState<string>(new Date().toLocaleTimeString());
  const [isSimulating, setIsSimulating] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastActionToast, setLastActionToast] = useState<string | null>(null);

  const handleRefreshMetrics = async () => {
    setIsRefreshing(true);
    try {
      if (onRefresh) {
        await onRefresh();
      }
      const nowStr = new Date().toLocaleTimeString();
      setLiveTimestamp(nowStr);
      setLastActionToast(`✅ Real-time metrics and warehouse stock counts updated (${nowStr})`);
      setTimeout(() => setLastActionToast(null), 4000);
    } catch (err) {
      console.error('Failed to refresh metrics:', err);
      setLastActionToast('⚠️ Unable to refresh metrics. Please check network connection.');
      setTimeout(() => setLastActionToast(null), 4000);
    } finally {
      setTimeout(() => setIsRefreshing(false), 500);
    }
  };

  // Filters
  const [selectedZone, setSelectedZone] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedAgingBucket, setSelectedAgingBucket] = useState<string>('ALL');

  // Quick PO Modal State
  const [selectedPoSku, setSelectedPoSku] = useState<ProductSKU | null>(null);
  const [poQty, setPoQty] = useState<number>(100);
  const [poSupplier, setPoSupplier] = useState<string>('Premier Global Logistics');
  const [isSubmittingPo, setIsSubmittingPo] = useState(false);

  // Update live clock every second
  useEffect(() => {
    const timer = setInterval(() => {
      setLiveTimestamp(new Date().toLocaleTimeString());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Helper: Calculate age in days since receipt or manufacture
  const calculateAgeInDays = (dateStr: string) => {
    if (!dateStr) return 0;
    const now = new Date();
    const target = new Date(dateStr);
    const diffTime = Math.abs(now.getTime() - target.getTime());
    return Math.floor(diffTime / (1000 * 60 * 60 * 24));
  };

  // Helper: Calculate days remaining until Expiry (BBD)
  const calculateDaysToExpiry = (bbdStr: string) => {
    if (!bbdStr) return 999;
    const now = new Date();
    const bbd = new Date(bbdStr);
    return Math.ceil((bbd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  };

  // 1. STOCK MAP PER SKU
  const skuStockMap = useMemo(() => {
    const map = new Map<string, { totalOnHand: number; totalAvailable: number; totalValuation: number }>();
    skus.forEach((s) => map.set(s.sku, { totalOnHand: 0, totalAvailable: 0, totalValuation: 0 }));

    batches.forEach((b) => {
      const existing = map.get(b.sku) || { totalOnHand: 0, totalAvailable: 0, totalValuation: 0 };
      const qty = b.quantityOnHand || 0;
      const cost = b.unitCost || 0;
      map.set(b.sku, {
        totalOnHand: existing.totalOnHand + qty,
        totalAvailable: existing.totalAvailable + (b.quantityAvailable || 0),
        totalValuation: existing.totalValuation + qty * cost
      });
    });
    return map;
  }, [skus, batches]);

  // 2. OVERALL REAL-TIME METRICS
  const metrics = useMemo(() => {
    const totalUnitsOnHands = batches.reduce((sum, b) => sum + (b.quantityOnHand || 0), 0);
    const totalUnitsAvailable = batches.reduce((sum, b) => sum + (b.quantityAvailable || 0), 0);
    const totalValuation = batches.reduce((sum, b) => sum + (b.quantityOnHand || 0) * (b.unitCost || 0), 0);
    const totalActiveBatches = batches.filter((b) => b.status === 'ACTIVE').length;
    const totalQuarantinedBatches = batches.filter((b) => b.status === 'QUARANTINED').length;

    // Items Low In Stock
    const lowStockSkus = skus.filter((sku) => {
      const stock = skuStockMap.get(sku.sku)?.totalOnHand || 0;
      return stock <= sku.reorderPoint;
    });

    // Aging & Expiry Risk Metrics
    const criticalExpiryBatches = batches.filter((b) => calculateDaysToExpiry(b.bestBeforeDate) <= 14);
    const expiringSoonBatches = batches.filter((b) => {
      const days = calculateDaysToExpiry(b.bestBeforeDate);
      return days > 14 && days <= 30;
    });

    return {
      totalUnitsOnHands,
      totalUnitsAvailable,
      totalValuation,
      totalActiveBatches,
      totalQuarantinedBatches,
      lowStockCount: lowStockSkus.length,
      criticalExpiryCount: criticalExpiryBatches.length,
      expiringSoonCount: expiringSoonBatches.length,
      lowStockSkus
    };
  }, [batches, skus, skuStockMap]);

  // 3. STOCK BY LOCATION & ZONE BREAKDOWN
  const activeZonesList = useMemo(() => {
    if (zones && Array.isArray(zones)) {
      return zones;
    }
    return INITIAL_ZONES;
  }, [zones]);

  useEffect(() => {
    if (selectedZone !== 'ALL' && !activeZonesList.some((z) => z.code === selectedZone)) {
      setSelectedZone('ALL');
    }
  }, [activeZonesList, selectedZone]);

  const zoneBreakdown = useMemo(() => {
    const map = new Map<
      string,
      {
        zoneName: string;
        totalUnits: number;
        totalValuation: number;
        batchCount: number;
        capacityLimit: number;
        locationCount: number;
        icon?: string;
      }
    >();

    // Initialize all active zones
    activeZonesList.forEach((z) => {
      const locsInZone = locations.filter((l) => l.zone === z.code).length;
      map.set(z.code, {
        zoneName: z.title || z.code,
        totalUnits: 0,
        totalValuation: 0,
        batchCount: 0,
        capacityLimit: z.maxCapacityKg || 5000,
        locationCount: locsInZone,
        icon: z.icon
      });
    });

    batches.forEach((b) => {
      const loc = locations.find((l) => l.id === b.locationId);
      const zoneKey = loc?.zone;
      if (zoneKey && map.has(zoneKey)) {
        const existing = map.get(zoneKey)!;
        existing.totalUnits += b.quantityOnHand || 0;
        existing.totalValuation += (b.quantityOnHand || 0) * (b.unitCost || 0);
        existing.batchCount += 1;
      }
    });

    return Array.from(map.entries()).map(([zone, data]) => ({
      zone,
      ...data,
      utilizationPct: Math.min(100, Math.round((data.totalUnits / Math.max(1, data.capacityLimit)) * 100))
    }));
  }, [activeZonesList, batches, locations]);

  // Bin Level Stock Location Aggregation
  const locationBinMetrics = useMemo(() => {
    const binMap = new Map<
      string,
      {
        locationId: string;
        zone: ZoneType;
        totalUnits: number;
        totalValuation: number;
        batches: Batch[];
      }
    >();

    locations.forEach((l) => {
      binMap.set(l.id, {
        locationId: l.id,
        zone: l.zone,
        totalUnits: 0,
        totalValuation: 0,
        batches: []
      });
    });

    batches.forEach((b) => {
      const existing = binMap.get(b.locationId) || {
        locationId: b.locationId,
        zone: 'DRY',
        totalUnits: 0,
        totalValuation: 0,
        batches: []
      };
      existing.totalUnits += b.quantityOnHand || 0;
      existing.totalValuation += (b.quantityOnHand || 0) * (b.unitCost || 0);
      existing.batches.push(b);
      binMap.set(b.locationId, existing);
    });

    return Array.from(binMap.values()).filter((bin) => {
      if (selectedZone !== 'ALL' && bin.zone !== selectedZone) return false;
      if (searchQuery.trim() !== '') {
        const q = searchQuery.toLowerCase();
        return (
          bin.locationId.toLowerCase().includes(q) ||
          bin.batches.some(
            (b) => b.batchNo.toLowerCase().includes(q) || b.itemName.toLowerCase().includes(q) || b.sku.toLowerCase().includes(q)
          )
        );
      }
      return true;
    });
  }, [locations, batches, selectedZone, searchQuery]);

  // 4. AGING INVENTORY BUCKETS BREAKDOWN
  const agingBuckets = useMemo(() => {
    let freshUnits = 0,
      freshVal = 0,
      freshLots = 0; // 0-30 days
    let moderateUnits = 0,
      moderateVal = 0,
      moderateLots = 0; // 31-60 days
    let agingUnits = 0,
      agingVal = 0,
      agingLots = 0; // 61-90 days
    let criticalAgingUnits = 0,
      criticalAgingVal = 0,
      criticalAgingLots = 0; // >90 days or <14d to expiry

    batches.forEach((b) => {
      const ageDays = calculateAgeInDays(b.receivedAt || b.manufactureDate);
      const daysToBbd = calculateDaysToExpiry(b.bestBeforeDate);
      const units = b.quantityOnHand || 0;
      const val = units * (b.unitCost || 0);

      if (daysToBbd <= 14 || ageDays > 90) {
        criticalAgingUnits += units;
        criticalAgingVal += val;
        criticalAgingLots += 1;
      } else if (ageDays > 60) {
        agingUnits += units;
        agingVal += val;
        agingLots += 1;
      } else if (ageDays > 30) {
        moderateUnits += units;
        moderateVal += val;
        moderateLots += 1;
      } else {
        freshUnits += units;
        freshVal += val;
        freshLots += 1;
      }
    });

    return {
      fresh: { units: freshUnits, val: freshVal, lots: freshLots },
      moderate: { units: moderateUnits, val: moderateVal, lots: moderateLots },
      aging: { units: agingUnits, val: agingVal, lots: agingLots },
      critical: { units: criticalAgingUnits, val: criticalAgingVal, lots: criticalAgingLots }
    };
  }, [batches]);

  // Filtered Batches for Aging Inventory Table
  const filteredAgingBatches = useMemo(() => {
    return batches
      .map((b) => {
        const ageDays = calculateAgeInDays(b.receivedAt || b.manufactureDate);
        const daysToBbd = calculateDaysToExpiry(b.bestBeforeDate);
        let bucket = 'FRESH';
        if (daysToBbd <= 14 || ageDays > 90) bucket = 'CRITICAL';
        else if (ageDays > 60) bucket = 'AGING';
        else if (ageDays > 30) bucket = 'MODERATE';

        return {
          ...b,
          ageDays,
          daysToBbd,
          bucket
        };
      })
      .filter((b) => {
        if (selectedAgingBucket !== 'ALL' && b.bucket !== selectedAgingBucket) return false;
        if (selectedZone !== 'ALL') {
          const loc = locations.find((l) => l.id === b.locationId);
          if (loc?.zone !== selectedZone) return false;
        }
        if (searchQuery.trim() !== '') {
          const q = searchQuery.toLowerCase();
          return (
            b.batchNo.toLowerCase().includes(q) ||
            b.sku.toLowerCase().includes(q) ||
            b.itemName.toLowerCase().includes(q) ||
            b.locationId.toLowerCase().includes(q)
          );
        }
        return true;
      })
      .sort((a, b) => b.ageDays - a.ageDays); // Sort oldest first
  }, [batches, locations, selectedAgingBucket, selectedZone, searchQuery]);

  // Real-time Simulation Trigger (Instant Inbound / Pick test)
  const handleSimulateInbound = async () => {
    setIsSimulating(true);
    try {
      const sampleSku = skus[0]?.sku || 'SKU-DAIRY-101';
      const sampleBatchNo = `REALTIME-${Math.floor(1000 + Math.random() * 9000)}`;
      const sampleQty = 100;
      const targetBin = locations[0]?.id || 'A-01-01';

      await receiveInboundStock({
        sku: sampleSku,
        batchNo: sampleBatchNo,
        manufactureDate: new Date().toISOString().split('T')[0],
        bestBeforeDate: new Date(Date.now() + 120 * 86400000).toISOString().split('T')[0],
        supplier: 'Apex Real-Time Simulation Feed',
        locationId: targetBin,
        quantity: sampleQty
      });

      if (onLogAuditActivity) {
        onLogAuditActivity(
          'INBOUND',
          'REALTIME_SIMULATION_INBOUND',
          `Batch ${sampleBatchNo}`,
          `Simulated real-time inbound scan: +${sampleQty} units of ${sampleSku} into ${targetBin}.`,
          'INFO'
        );
      }

      setLastActionToast(`⚡ Live Update Received: +${sampleQty} units (Batch ${sampleBatchNo}) added to ${targetBin}!`);
      onRefresh();
      setTimeout(() => setLastActionToast(null), 5000);
    } catch (err: any) {
      console.error('Simulation error:', err);
    } finally {
      setIsSimulating(false);
    }
  };

  // Handle Quick Reorder PO Submit
  const handleConfirmPo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPoSku) return;
    setIsSubmittingPo(true);
    try {
      const createdPo = await createPurchaseOrder({
        sku: selectedPoSku.sku,
        itemName: selectedPoSku.name,
        supplier: poSupplier,
        reorderQuantity: Number(poQty),
        unitCost: 15.0,
        expectedDeliveryDate: new Date(Date.now() + 5 * 86400000).toISOString().split('T')[0],
        generatedBy: `${currentUser.name} (${currentUser.role})`,
        destinationLocationId: locations.find((l) => l.zone === selectedPoSku.storageZone)?.id || 'A-01-01',
        notes: `Quick Reorder issued directly from Real-Time Dashboard safety monitor.`
      });

      if (onLogAuditActivity) {
        onLogAuditActivity(
          'INBOUND',
          'PURCHASE_ORDER_GENERATED',
          `PO ${createdPo.id}`,
          `Quick PO issued for ${poQty} ${selectedPoSku.unit} of ${selectedPoSku.name} to vendor ${poSupplier}.`,
          'INFO'
        );
      }

      setLastActionToast(`✅ Purchase Order ${createdPo.id} issued for ${poQty} units of ${selectedPoSku.name}!`);
      setSelectedPoSku(null);
      onRefresh();
      setTimeout(() => setLastActionToast(null), 5000);
    } catch (err: any) {
      alert(`PO creation failed: ${err.message}`);
    } finally {
      setIsSubmittingPo(false);
    }
  };

  return (
    <div className="space-y-6">
      
      {/* 1. Header Banner & Live Status Feed Control */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 text-white rounded-2xl p-6 shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-blue-500/20 via-transparent to-transparent pointer-events-none" />

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 relative z-10">
          <div>
            <div className="flex items-center space-x-2 mb-2">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
              </span>
              <span className="font-mono text-xs font-bold text-emerald-400 tracking-wider uppercase">
                Real-Time Data Feed Active • {liveTimestamp}
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
              Real-Time Inventory Operations Dashboard
            </h1>
            <p className="text-xs sm:text-sm text-slate-300 mt-1 max-w-2xl">
              Live automated tracking of total stock counts, warehouse zone capacities, low-stock reorder thresholds, and FEFO aging inventory matrix.
            </p>
          </div>

          {/* Action Controls & Simulation Buttons */}
          <div className="flex items-center space-x-2 flex-wrap gap-2">
            <button
              onClick={handleSimulateInbound}
              disabled={isSimulating}
              className="px-3.5 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black rounded-xl text-xs flex items-center space-x-1.5 transition-all shadow-md cursor-pointer disabled:opacity-50"
            >
              <Zap className={`w-4 h-4 ${isSimulating ? 'animate-spin' : ''}`} />
              <span>Simulate Real-Time Scan</span>
            </button>

            <button
              onClick={handleRefreshMetrics}
              disabled={isRefreshing}
              className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-xl text-xs border border-slate-700 flex items-center space-x-1.5 transition-all cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 text-blue-400 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span>{isRefreshing ? 'Refreshing Metrics...' : 'Refresh Metrics'}</span>
            </button>

            {onOpenInboundModal && (
              <button
                onClick={onOpenInboundModal}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-xs flex items-center space-x-2 transition-all shadow-sm cursor-pointer border border-blue-500/30"
              >
                <PlusCircle className="w-4 h-4" />
                <span>Inbound Stock Receive</span>
              </button>
            )}
          </div>
        </div>

        {/* Toast Banner for Real-Time Event */}
        {lastActionToast && (
          <div className="mt-4 p-3 bg-emerald-500/20 border border-emerald-400/40 rounded-xl text-xs text-emerald-200 font-semibold flex items-center space-x-2 animate-fadeIn">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            <span>{lastActionToast}</span>
          </div>
        )}
      </div>

      {/* 2. Top Metric Cards (Total Stock Count, Valuation, Low Stock & Expiry) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* Metric 1: Total Stock Count */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs relative overflow-hidden group hover:border-blue-400 transition-all">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Stock Count</span>
            <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600">
              <Boxes className="w-5 h-5" />
            </div>
          </div>
          <div className="flex items-baseline space-x-2">
            <h3 className="text-3xl font-black text-slate-900 tracking-tight">
              {metrics.totalUnitsOnHands.toLocaleString()}
            </h3>
            <span className="text-xs font-semibold text-slate-500">units</span>
          </div>
          <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
            <span className="text-emerald-700 font-medium font-mono">
              {metrics.totalUnitsAvailable.toLocaleString()} available
            </span>
            <span className="text-slate-400 text-[11px] font-mono">
              {metrics.totalActiveBatches} active lots
            </span>
          </div>
        </div>

        {/* Metric 2: Total Stock Valuation */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs relative overflow-hidden group hover:border-emerald-400 transition-all">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Stock Valuation</span>
            <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600">
              <DollarSign className="w-5 h-5" />
            </div>
          </div>
          <div className="flex items-baseline space-x-2">
            <h3 className="text-3xl font-black text-emerald-800 tracking-tight">
              ${metrics.totalValuation.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </h3>
          </div>
          <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
            <span className="text-slate-600 font-medium">Sum of (Qty × Unit Cost)</span>
            <span className="text-purple-700 font-mono text-[11px] font-semibold">
              {metrics.totalQuarantinedBatches} quarantined
            </span>
          </div>
        </div>

        {/* Metric 3: Low Stock Items Alert Count */}
        <div className={`bg-white border rounded-2xl p-5 shadow-xs relative overflow-hidden group transition-all ${
          !enableSafetyReorder
            ? 'border-slate-200 bg-slate-50/50'
            : metrics.lowStockCount > 0 ? 'border-amber-300 ring-2 ring-amber-400/20' : 'border-slate-200'
        }`}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Low Stock Items</span>
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
              !enableSafetyReorder
                ? 'bg-slate-100 text-slate-400'
                : metrics.lowStockCount > 0 ? 'bg-amber-100 border border-amber-300 text-amber-700' : 'bg-slate-100 text-slate-500'
            }`}>
              <ShoppingCart className="w-5 h-5" />
            </div>
          </div>
          <div className="flex items-baseline space-x-2">
            <h3 className={`text-3xl font-black tracking-tight ${!enableSafetyReorder ? 'text-slate-400' : metrics.lowStockCount > 0 ? 'text-amber-700' : 'text-slate-900'}`}>
              {enableSafetyReorder ? metrics.lowStockCount : 'OFF'}
            </h3>
            <span className="text-xs font-semibold text-slate-500">
              {enableSafetyReorder ? 'SKUs below reorder point' : 'Safety Reorder Disabled'}
            </span>
          </div>
          <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
            <span className={enableSafetyReorder ? 'text-amber-800 font-semibold' : 'text-slate-400 italic'}>
              {enableSafetyReorder
                ? (metrics.lowStockCount > 0 ? 'Reorder PO recommended' : 'Stock levels optimal')
                : 'Admin feature disabled'}
            </span>
            <span className="text-slate-400 text-[11px]">
              {enableSafetyReorder ? 'Safety buffer active' : 'Optional toggle'}
            </span>
          </div>
        </div>

        {/* Metric 4: Critical Expiry / Aging Alert */}
        <div className={`bg-white border rounded-2xl p-5 shadow-xs relative overflow-hidden group transition-all ${
          metrics.criticalExpiryCount > 0 ? 'border-rose-300 ring-2 ring-rose-400/20' : 'border-slate-200'
        }`}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider font-sans">Critical Expiry (&lt;14d)</span>
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
              metrics.criticalExpiryCount > 0 ? 'bg-rose-100 border border-rose-300 text-rose-700' : 'bg-slate-100 text-slate-500'
            }`}>
              <AlertTriangle className="w-5 h-5" />
            </div>
          </div>
          <div className="flex items-baseline space-x-2">
            <h3 className={`text-3xl font-black tracking-tight ${metrics.criticalExpiryCount > 0 ? 'text-rose-700' : 'text-slate-900'}`}>
              {metrics.criticalExpiryCount}
            </h3>
            <span className="text-xs font-semibold text-slate-500">batches requiring FEFO</span>
          </div>
          <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
            <span className="text-rose-700 font-semibold font-mono">
              +{metrics.expiringSoonCount} expiring in 14-30d
            </span>
            <span className="text-slate-400 text-[11px]">FEFO Priority</span>
          </div>
        </div>

      </div>

      {/* 3. STOCK BY LOCATION - WAREHOUSE ZONES & OCCUPANCY */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center space-x-2 text-blue-600 font-bold text-xs uppercase tracking-wider mb-1">
              <MapPin className="w-4 h-4" />
              <span>Stock by Location & Warehouse Zone Capacities</span>
            </div>
            <h2 className="text-xl font-black text-slate-900">
              Warehouse Storage Distribution Matrix
            </h2>
          </div>

          {/* Zone Selector & Edit Zones Button */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center space-x-2">
              <Filter className="w-4 h-4 text-slate-400" />
              <select
                value={selectedZone}
                onChange={(e) => setSelectedZone(e.target.value)}
                className="bg-slate-50 border border-slate-300 rounded-xl px-3 py-1.5 text-xs text-slate-800 font-semibold focus:outline-none focus:border-blue-500 cursor-pointer"
              >
                <option value="ALL">All Storage Zones ({activeZonesList.length})</option>
                {activeZonesList.map((z) => (
                  <option key={z.code} value={z.code}>
                    {z.icon ? `${z.icon} ` : ''}{z.title || z.code}
                  </option>
                ))}
              </select>
            </div>

            {onNavigateToFacilityLayout && (
              <button
                type="button"
                onClick={onNavigateToFacilityLayout}
                className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-xl font-bold text-xs transition-all cursor-pointer flex items-center space-x-1.5 shadow-2xs"
                title="Configure Facility Storage Zones, Temperature Ranges & Bin Capacities"
              >
                <Settings className="w-3.5 h-3.5" />
                <span>Edit Zones & Capacities</span>
              </button>
            )}
          </div>
        </div>

        {/* Zone Progress Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {zoneBreakdown.map((z) => (
            <div
              key={z.zone}
              onClick={() => setSelectedZone(selectedZone === z.zone ? 'ALL' : z.zone)}
              className={`p-4 rounded-xl border transition-all cursor-pointer ${
                selectedZone === z.zone
                  ? 'bg-blue-50 border-blue-500 shadow-xs ring-2 ring-blue-400/20'
                  : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
              }`}
            >
              <div className="flex justify-between items-start mb-2">
                <span className="font-bold text-xs text-slate-900">{z.zoneName}</span>
                <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                  z.utilizationPct > 85 ? 'bg-rose-100 text-rose-800 border border-rose-300' : 'bg-slate-200 text-slate-800'
                }`}>
                  {z.utilizationPct}% Occupied
                </span>
              </div>

              <div className="flex justify-between items-baseline text-xs mb-1">
                <span className="font-mono font-bold text-slate-800">{z.totalUnits.toLocaleString()} units</span>
                <span className="text-[11px] text-slate-500">Cap: {z.capacityLimit.toLocaleString()}</span>
              </div>

              {/* Occupancy Progress bar */}
              <div className="w-full bg-slate-200 h-2.5 rounded-full overflow-hidden mb-2">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    z.utilizationPct > 85 ? 'bg-rose-500' : z.utilizationPct > 70 ? 'bg-amber-500' : 'bg-emerald-500'
                  }`}
                  style={{ width: `${Math.max(5, z.utilizationPct)}%` }}
                />
              </div>

              <div className="flex justify-between text-[11px] font-mono text-slate-500 pt-1 border-t border-slate-200">
                <span>{z.batchCount} batches</span>
                <span className="font-bold text-slate-700">${z.totalValuation.toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Location Bin Matrix Table */}
        <div className="border border-slate-200 rounded-xl overflow-hidden">
          <div className="bg-slate-50 p-3 border-b border-slate-200 flex justify-between items-center text-xs font-mono">
            <span className="font-bold text-slate-800 flex items-center space-x-2">
              <Layers className="w-4 h-4 text-blue-600" />
              <span>Real-Time Bin Occupancy ({locationBinMetrics.length} Active Storage Bins)</span>
            </span>
          </div>

          <div className="overflow-x-auto max-h-[300px]">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-100 text-slate-600 uppercase font-mono border-b border-slate-200 text-[11px] sticky top-0">
                <tr>
                  <th className="py-2.5 px-4">Bin Location</th>
                  <th className="py-2.5 px-4">Zone</th>
                  <th className="py-2.5 px-4 text-center">Batches Stored</th>
                  <th className="py-2.5 px-4 text-right">Total Units</th>
                  <th className="py-2.5 px-4 text-right">Valuation ($)</th>
                  <th className="py-2.5 px-4 text-center">Stored SKUs</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 font-sans">
                {locationBinMetrics.map((bin) => (
                  <tr key={bin.locationId} className="hover:bg-slate-50 transition-colors">
                    <td className="py-2.5 px-4 font-mono font-bold text-blue-700">
                      {bin.locationId}
                    </td>

                    <td className="py-2.5 px-4 text-slate-600 font-mono text-[11px]">
                      {bin.zone}
                    </td>

                    <td className="py-2.5 px-4 text-center font-mono font-bold text-slate-800">
                      {bin.batches.length}
                    </td>

                    <td className="py-2.5 px-4 text-right font-mono font-bold text-slate-900">
                      {bin.totalUnits.toLocaleString()}
                    </td>

                    <td className="py-2.5 px-4 text-right font-mono text-emerald-700 font-bold">
                      ${bin.totalValuation.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>

                    <td className="py-2.5 px-4 text-center font-mono text-[11px] text-slate-600">
                      {bin.batches.map((b) => b.sku).join(', ') || 'Empty Bin'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      </div>

      {/* 4. ITEMS LOW IN STOCK (SAFETY REORDER CENTER) */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center space-x-2 text-amber-600 font-bold text-xs uppercase tracking-wider mb-1">
              <ShoppingCart className="w-4 h-4" />
              <span>Real-Time Safety Threshold Monitor</span>
              <span className="text-slate-400 font-normal ml-2 text-[11px]">(Optional Feature)</span>
            </div>
            <h2 className="text-xl font-black text-slate-900">
              Items Low in Stock & Reorder Alerts
            </h2>
          </div>

          <div className="flex items-center space-x-3">
            {/* Admin Ticket Checkbox Toggle */}
            {currentUser.role === 'Admin' && onToggleSafetyReorder && (
              <label className="flex items-center space-x-2 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 cursor-pointer hover:bg-slate-100 transition-colors">
                <input
                  type="checkbox"
                  checked={enableSafetyReorder}
                  onChange={(e) => onToggleSafetyReorder(e.target.checked)}
                  className="w-4 h-4 text-amber-600 rounded border-slate-300 focus:ring-amber-500 cursor-pointer"
                />
                <span className="text-[11px]">Safety Reorder Levels: <strong className={enableSafetyReorder ? 'text-amber-700' : 'text-slate-500'}>{enableSafetyReorder ? 'Ticked ON' : 'OFF'}</strong></span>
              </label>
            )}

            {enableSafetyReorder && (
              <span className="px-3 py-1 bg-amber-100 text-amber-800 border border-amber-300 rounded-full text-xs font-bold font-mono">
                {metrics.lowStockSkus.length} Items Require Immediate Reorder
              </span>
            )}
          </div>
        </div>

        {!enableSafetyReorder ? (
          <div className="p-8 text-center bg-slate-50 rounded-xl border border-slate-200 space-y-3">
            <ShieldAlert className="w-10 h-10 text-slate-400 mx-auto" />
            <div>
              <p className="text-slate-800 font-bold text-base">Safety Reorder Levels Feature is Disabled</p>
              <p className="text-slate-500 text-xs max-w-md mx-auto mt-1">
                This optional safety reorder function is currently turned off by Admin configuration. Reorder points and low-stock replenishment alerts are bypassed.
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
        ) : metrics.lowStockSkus.length === 0 ? (
          <div className="p-8 text-center bg-slate-50 rounded-xl border border-slate-200 space-y-2">
            <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto" />
            <p className="text-slate-800 font-bold text-sm">All Inventory Stock Levels are Healthy!</p>
            <p className="text-slate-500 text-xs">No SKUs are currently at or below their safety reorder thresholds.</p>
          </div>
        ) : (
          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-50 text-slate-600 uppercase font-mono border-b border-slate-200 text-[11px]">
                <tr>
                  <th className="py-3 px-4">SKU / Item</th>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4 text-right">Current On-Hand</th>
                  <th className="py-3 px-4 text-right">Reorder Point</th>
                  <th className="py-3 px-4">Stock Level Progress</th>
                  <th className="py-3 px-4 text-center">Urgency</th>
                  <th className="py-3 px-4 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 font-sans">
                {metrics.lowStockSkus.map((sku) => {
                  const currentStock = skuStockMap.get(sku.sku)?.totalOnHand || 0;
                  const pctOfReorder = Math.min(100, Math.round((currentStock / sku.reorderPoint) * 100));
                  const isCritical = currentStock <= Math.round(sku.reorderPoint / 2);

                  return (
                    <tr key={sku.sku} className="hover:bg-amber-50/50 transition-colors">
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-900">{sku.name}</div>
                        <div className="text-[11px] font-mono text-blue-700">{sku.sku}</div>
                      </td>

                      <td className="py-3 px-4 text-slate-600 text-xs">
                        {sku.category}
                      </td>

                      <td className="py-3 px-4 text-right font-mono font-bold text-slate-900 text-sm">
                        {currentStock} <span className="text-[10px] text-slate-500 font-normal">{sku.unit}</span>
                      </td>

                      <td className="py-3 px-4 text-right font-mono text-slate-600">
                        {sku.reorderPoint} {sku.unit}
                      </td>

                      <td className="py-3 px-4 min-w-[160px]">
                        <div className="flex justify-between text-[10px] font-mono mb-1">
                          <span className="text-slate-500">{pctOfReorder}% of limit</span>
                          <span className={isCritical ? 'text-rose-600 font-bold' : 'text-amber-600 font-semibold'}>
                            {currentStock} / {sku.reorderPoint}
                          </span>
                        </div>
                        <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${isCritical ? 'bg-rose-600' : 'bg-amber-500'}`}
                            style={{ width: `${Math.max(8, pctOfReorder)}%` }}
                          />
                        </div>
                      </td>

                      <td className="py-3 px-4 text-center whitespace-nowrap">
                        {isCritical ? (
                          <span className="px-2.5 py-0.5 bg-rose-100 text-rose-800 border border-rose-300 rounded-full text-[10px] font-bold uppercase">
                            Emergency Low
                          </span>
                        ) : (
                          <span className="px-2.5 py-0.5 bg-amber-100 text-amber-800 border border-amber-300 rounded-full text-[10px] font-bold uppercase">
                            Reorder Needed
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-center">
                        <button
                          onClick={() => {
                            setSelectedPoSku(sku);
                            setPoQty(Math.max(50, Math.ceil((sku.reorderPoint * 2 - currentStock) / 25) * 25));
                          }}
                          className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-lg shadow-xs transition-all cursor-pointer whitespace-nowrap"
                        >
                          + Issue PO
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 5. AGING INVENTORY ANALYSIS */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center space-x-2 text-purple-600 font-bold text-xs uppercase tracking-wider mb-1">
              <Clock className="w-4 h-4" />
              <span>Aging Inventory Matrix & FEFO Risk Analysis</span>
            </div>
            <h2 className="text-xl font-black text-slate-900">
              Aging Batches & Expiry Risk Matrix
            </h2>
          </div>

          {/* Aging Filter */}
          <div className="flex items-center space-x-2">
            <select
              value={selectedAgingBucket}
              onChange={(e) => setSelectedAgingBucket(e.target.value)}
              className="bg-slate-50 border border-slate-300 rounded-xl px-3 py-1.5 text-xs text-slate-800 font-semibold focus:outline-none focus:border-purple-500"
            >
              <option value="ALL">All Aging Buckets</option>
              <option value="FRESH">Fresh Stock (0 - 30 days)</option>
              <option value="MODERATE">Established Stock (31 - 60 days)</option>
              <option value="AGING">Aging Stock (61 - 90 days)</option>
              <option value="CRITICAL">Critical Aging (&gt;90 days or &lt;14d BBD)</option>
            </select>
          </div>
        </div>

        {/* Aging Bucket Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          
          <div
            onClick={() => setSelectedAgingBucket(selectedAgingBucket === 'FRESH' ? 'ALL' : 'FRESH')}
            className={`p-4 rounded-xl border transition-all cursor-pointer ${
              selectedAgingBucket === 'FRESH'
                ? 'bg-emerald-50 border-emerald-500 shadow-xs'
                : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
            }`}
          >
            <div className="flex justify-between items-center mb-1">
              <span className="text-xs font-bold text-slate-700">Fresh Stock (0-30d)</span>
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
            </div>
            <p className="text-2xl font-black text-slate-900">{agingBuckets.fresh.units.toLocaleString()} <span className="text-xs font-normal text-slate-500">units</span></p>
            <p className="text-xs text-emerald-700 font-mono font-bold mt-1">${agingBuckets.fresh.val.toLocaleString('en-US', { maximumFractionDigits: 0 })} • {agingBuckets.fresh.lots} lots</p>
          </div>

          <div
            onClick={() => setSelectedAgingBucket(selectedAgingBucket === 'MODERATE' ? 'ALL' : 'MODERATE')}
            className={`p-4 rounded-xl border transition-all cursor-pointer ${
              selectedAgingBucket === 'MODERATE'
                ? 'bg-blue-50 border-blue-500 shadow-xs'
                : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
            }`}
          >
            <div className="flex justify-between items-center mb-1">
              <span className="text-xs font-bold text-slate-700">Established (31-60d)</span>
              <span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span>
            </div>
            <p className="text-2xl font-black text-slate-900">{agingBuckets.moderate.units.toLocaleString()} <span className="text-xs font-normal text-slate-500">units</span></p>
            <p className="text-xs text-blue-700 font-mono font-bold mt-1">${agingBuckets.moderate.val.toLocaleString('en-US', { maximumFractionDigits: 0 })} • {agingBuckets.moderate.lots} lots</p>
          </div>

          <div
            onClick={() => setSelectedAgingBucket(selectedAgingBucket === 'AGING' ? 'ALL' : 'AGING')}
            className={`p-4 rounded-xl border transition-all cursor-pointer ${
              selectedAgingBucket === 'AGING'
                ? 'bg-amber-50 border-amber-500 shadow-xs'
                : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
            }`}
          >
            <div className="flex justify-between items-center mb-1">
              <span className="text-xs font-bold text-slate-700">Aging Stock (61-90d)</span>
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
            </div>
            <p className="text-2xl font-black text-slate-900">{agingBuckets.aging.units.toLocaleString()} <span className="text-xs font-normal text-slate-500">units</span></p>
            <p className="text-xs text-amber-700 font-mono font-bold mt-1">${agingBuckets.aging.val.toLocaleString('en-US', { maximumFractionDigits: 0 })} • {agingBuckets.aging.lots} lots</p>
          </div>

          <div
            onClick={() => setSelectedAgingBucket(selectedAgingBucket === 'CRITICAL' ? 'ALL' : 'CRITICAL')}
            className={`p-4 rounded-xl border transition-all cursor-pointer ${
              selectedAgingBucket === 'CRITICAL'
                ? 'bg-rose-50 border-rose-500 shadow-xs'
                : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
            }`}
          >
            <div className="flex justify-between items-center mb-1">
              <span className="text-xs font-bold text-slate-700">Critical (&gt;90d or &lt;14d BBD)</span>
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse"></span>
            </div>
            <p className="text-2xl font-black text-rose-700">{agingBuckets.critical.units.toLocaleString()} <span className="text-xs font-normal text-slate-500">units</span></p>
            <p className="text-xs text-rose-700 font-mono font-bold mt-1">${agingBuckets.critical.val.toLocaleString('en-US', { maximumFractionDigits: 0 })} • {agingBuckets.critical.lots} lots</p>
          </div>

        </div>

        {/* Aging Batches Table */}
        <div className="border border-slate-200 rounded-xl overflow-hidden">
          <div className="bg-slate-50 p-3 border-b border-slate-200 flex justify-between items-center text-xs font-mono">
            <span className="font-bold text-slate-800">Aging Inventory Batches ({filteredAgingBatches.length} Lots)</span>
            <span className="text-slate-500 text-[11px]">Sorted by oldest age in warehouse</span>
          </div>

          <div className="overflow-x-auto max-h-[350px]">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-100 text-slate-600 uppercase font-mono border-b border-slate-200 text-[11px] sticky top-0">
                <tr>
                  <th className="py-2.5 px-4">Batch No / SKU</th>
                  <th className="py-2.5 px-4">Item Description</th>
                  <th className="py-2.5 px-4">Bin Location</th>
                  <th className="py-2.5 px-4 text-center">Age in WH (Days)</th>
                  <th className="py-2.5 px-4">Best Before Date (BBD)</th>
                  <th className="py-2.5 px-4 text-right">Quantity On-Hand</th>
                  <th className="py-2.5 px-4 text-center">Aging Risk Level</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 font-sans">
                {filteredAgingBatches.map((b) => (
                  <tr key={b.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-2.5 px-4 font-mono font-bold">
                      <div className="text-slate-900">{b.batchNo}</div>
                      <div className="text-[10px] text-blue-700 font-normal">{b.sku}</div>
                    </td>

                    <td className="py-2.5 px-4">
                      <div className="font-bold text-slate-900">{b.itemName}</div>
                      <div className="text-[11px] text-slate-500">Supplier: {b.supplier}</div>
                    </td>

                    <td className="py-2.5 px-4 font-mono font-bold text-slate-800">
                      {b.locationId}
                    </td>

                    <td className="py-2.5 px-4 text-center font-mono font-bold">
                      <span className={`px-2 py-0.5 rounded text-[11px] ${
                        b.ageDays > 90 ? 'bg-rose-100 text-rose-800 border border-rose-300' : b.ageDays > 60 ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-800'
                      }`}>
                        {b.ageDays} days
                      </span>
                    </td>

                    <td className="py-2.5 px-4 font-mono">
                      <div className="font-bold text-slate-900">{b.bestBeforeDate}</div>
                      <div className={`text-[10px] ${b.daysToBbd <= 14 ? 'text-rose-600 font-bold' : 'text-slate-500'}`}>
                        {b.daysToBbd < 0 ? 'EXPIRED' : `${b.daysToBbd}d remaining`}
                      </div>
                    </td>

                    <td className="py-2.5 px-4 text-right font-mono font-bold text-slate-900">
                      {b.quantityOnHand.toLocaleString()}
                    </td>

                    <td className="py-2.5 px-4 text-center whitespace-nowrap">
                      {b.bucket === 'CRITICAL' ? (
                        <span className="px-2.5 py-0.5 bg-rose-100 text-rose-800 border border-rose-300 rounded-full text-[10px] font-bold uppercase">
                          Critical FEFO Action
                        </span>
                      ) : b.bucket === 'AGING' ? (
                        <span className="px-2.5 py-0.5 bg-amber-100 text-amber-800 border border-amber-300 rounded-full text-[10px] font-bold uppercase">
                          Aging (60-90d)
                        </span>
                      ) : b.bucket === 'MODERATE' ? (
                        <span className="px-2.5 py-0.5 bg-blue-100 text-blue-800 border border-blue-300 rounded-full text-[10px] font-bold uppercase">
                          Established
                        </span>
                      ) : (
                        <span className="px-2.5 py-0.5 bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-full text-[10px] font-bold uppercase">
                          Fresh Stock
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* 6. LIVE TRANSACTION STREAM TICKER */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2 text-emerald-600 font-bold text-xs uppercase tracking-wider">
            <Activity className="w-4 h-4" />
            <span>Real-Time Live Transaction Log Stream</span>
          </div>
          <span className="text-xs text-slate-500 font-mono">
            Showing last {stockMovements.length} live inventory events
          </span>
        </div>

        <div className="space-y-2 max-h-[250px] overflow-y-auto pr-1">
          {stockMovements.map((mov) => (
            <div
              key={mov.id}
              className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between text-xs hover:bg-slate-100 transition-colors"
            >
              <div className="flex items-center space-x-3">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs ${
                  mov.type === 'INBOUND_RECEIVE'
                    ? 'bg-emerald-100 text-emerald-700'
                    : mov.type === 'PICK_OUTBOUND'
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-amber-100 text-amber-700'
                }`}>
                  {mov.type === 'INBOUND_RECEIVE' ? <ArrowDownLeft className="w-4 h-4" /> : <ArrowUpRight className="w-4 h-4" />}
                </div>

                <div>
                  <div className="flex items-center space-x-2 font-mono">
                    <span className="font-bold text-slate-900">{mov.batchNo}</span>
                    <span className="text-slate-400">•</span>
                    <span className="text-blue-700 font-semibold">{mov.sku}</span>
                    <span className="text-slate-400">•</span>
                    <span className="text-slate-600">{mov.locationId}</span>
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    Operator: <strong className="text-slate-700">{mov.performedBy}</strong> {mov.reason && `— "${mov.reason}"`}
                  </div>
                </div>
              </div>

              <div className="text-right font-mono">
                <span className={`font-bold text-sm ${
                  mov.type === 'INBOUND_RECEIVE' ? 'text-emerald-700' : 'text-blue-700'
                }`}>
                  {mov.type === 'INBOUND_RECEIVE' ? `+${mov.quantity}` : `-${mov.quantity}`} units
                </span>
                <div className="text-[10px] text-slate-400">{mov.timestamp}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* QUICK ISSUE PO MODAL */}
      {selectedPoSku && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4 animate-scaleUp">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div className="flex items-center space-x-2">
                <ShoppingCart className="w-5 h-5 text-amber-600" />
                <h3 className="font-black text-slate-900 text-base">Issue Purchase Order</h3>
              </div>
              <button
                onClick={() => setSelectedPoSku(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleConfirmPo} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-600 font-bold mb-1">SKU & Item Name</label>
                <input
                  type="text"
                  disabled
                  value={`${selectedPoSku.sku} — ${selectedPoSku.name}`}
                  className="w-full bg-slate-100 border border-slate-300 rounded-xl px-3 py-2 font-mono text-slate-900"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-600 font-bold mb-1">Reorder Quantity</label>
                  <input
                    type="number"
                    min="1"
                    value={poQty}
                    onChange={(e) => setPoQty(Number(e.target.value))}
                    className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 font-mono text-slate-900"
                  />
                </div>
              </div>

              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 font-mono text-[11px]">
                Estimated Order Cost: ${(poQty * 15.0).toFixed(2)} ($15.00 / unit)
              </div>

              <button
                type="submit"
                disabled={isSubmittingPo}
                className="w-full py-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs rounded-xl shadow-xs transition-all cursor-pointer"
              >
                {isSubmittingPo ? 'Issuing PO...' : 'Confirm & Issue Purchase Order'}
              </button>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
