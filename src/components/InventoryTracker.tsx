import React, { useState, useMemo, useEffect } from 'react';
import {
  Boxes,
  PlusCircle,
  Search,
  Filter,
  AlertTriangle,
  Calendar,
  MapPin,
  Barcode,
  ShieldAlert,
  ArrowUpRight,
  ArrowDownLeft,
  RefreshCw,
  CheckCircle2,
  X,
  History,
  TrendingUp,
  Lock,
  ShoppingCart,
  PackagePlus,
  AlertCircle,
  FileText,
  Layers,
  TrendingDown,
  DollarSign,
  Truck,
  Building2,
  Clock,
  ArrowRight,
  BarChart3,
  Edit3,
  Tag,
  FolderPlus,
  FolderEdit,
  Download,
  Sliders,
  FileSpreadsheet,
  Trash2,
  LayoutGrid,
  List,
  Table,
  FolderTree,
  PackageMinus
} from 'lucide-react';
import { Batch, Location, ProductSKU, StockMovement, AuditCategory, PurchaseOrder, ZoneType, WarehouseFacility, StorageZone, PickOrder } from '../types/wms';
import { UserProfile, UserRole, WmsPermission, hasPermission } from '../types/roles';
import { receiveInboundStock, toggleBatchQuarantine, fetchPurchaseOrders, createPurchaseOrder, deletePurchaseOrder, clearStockMovements, syncCatcherGourmetMatrix, createSKU, updateSKU, renameCategory, deleteCategory, adjustStock, createLocation, updateLocation, deleteLocation, createFacility, updateFacility, deleteFacility, createZone, updateZone, deleteZone } from '../services/api';
import { InventoryReportGenerator } from './InventoryReportGenerator';
import { RealtimeDashboard } from './RealtimeDashboard';
import { CsvImportModal } from './CsvImportModal';
import { OutboundStockModal } from './OutboundStockModal';
import { INITIAL_FACILITIES, INITIAL_ZONES } from '../data/initialData';

interface InventoryTrackerProps {
  skus: ProductSKU[];
  batches: any[];
  locations: Location[];
  facilities?: WarehouseFacility[];
  zones?: StorageZone[];
  stockMovements: StockMovement[];
  orders?: PickOrder[];
  currentUser: UserProfile;
  deletedCategories?: string[];
  onRefresh: () => void;
  onLogAuditActivity?: (
    actionCategory: AuditCategory,
    actionType: string,
    targetEntity: string,
    details: string,
    severity?: 'INFO' | 'WARNING' | 'CRITICAL'
  ) => void;
  onOpenRoleModal?: () => void;
  onNavigateTab?: (tab: 'salesOrders' | 'inventory' | 'reports') => void;
  enableSafetyReorder?: boolean;
  onToggleSafetyReorder?: (enabled: boolean) => void;
  enableInboundSupplier?: boolean;
  onToggleInboundSupplier?: (enabled: boolean) => void;
  customRolePermissions?: Record<UserRole, WmsPermission[]>;
}

export const InventoryTracker: React.FC<InventoryTrackerProps> = ({
  skus,
  batches,
  locations,
  facilities = [],
  zones = [],
  stockMovements,
  orders = [],
  currentUser,
  deletedCategories = [],
  onRefresh,
  onLogAuditActivity,
  onOpenRoleModal,
  onNavigateTab,
  enableSafetyReorder = true,
  onToggleSafetyReorder,
  enableInboundSupplier = true,
  onToggleInboundSupplier,
  customRolePermissions
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<string>('ALL');
  const [selectedZoneFilter, setSelectedZoneFilter] = useState<string>('ALL');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('ALL');
  const [skuCatalogLayout, setSkuCatalogLayout] = useState<'grid' | 'table' | 'category'>('grid');
  const [activeViewMode, setActiveViewMode] = useState<'dashboard' | 'batches' | 'skus' | 'sheetMatrix' | 'purchaseOrders' | 'facilities' | 'reports'>('dashboard');
  const [showInboundModal, setShowInboundModal] = useState(false);
  const [showMovementLogDrawer, setShowMovementLogDrawer] = useState(false);

  // Outbound Loose Stock Modal State
  const [showOutboundModal, setShowOutboundModal] = useState(false);
  const [outboundSku, setOutboundSku] = useState<string | undefined>(undefined);
  const [outboundBatchNo, setOutboundBatchNo] = useState<string | undefined>(undefined);
  const [outboundOrderId, setOutboundOrderId] = useState<string | undefined>(undefined);
  const [outboundToast, setOutboundToast] = useState<string | null>(null);

  const handleOpenOutboundModal = (sku?: string, batchNo?: string, orderId?: string) => {
    setOutboundSku(sku);
    setOutboundBatchNo(batchNo);
    setOutboundOrderId(orderId);
    setShowOutboundModal(true);
  };

  // Facility & Putaway Bin Location Management state
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [editingLocation, setEditingLocation] = useState<Location | null>(null);
  const [locAisle, setLocAisle] = useState('A');
  const [locRack, setLocRack] = useState<number>(1);
  const [locShelf, setLocShelf] = useState<number>(1);
  const [locBin, setLocBin] = useState('01');
  const [locZone, setLocZone] = useState<ZoneType>('DRY');
  const [locCapacityKg, setLocCapacityKg] = useState<number>(500);
  const [isSubmittingLoc, setIsSubmittingLoc] = useState(false);
  const [facilitySearchQuery, setFacilitySearchQuery] = useState('');
  const [facilityZoneFilter, setFacilityZoneFilter] = useState<string>('ALL');

  // Facility Management Modal state
  const [showFacilityModal, setShowFacilityModal] = useState(false);
  const [editingFacility, setEditingFacility] = useState<WarehouseFacility | null>(null);
  const [facCode, setFacCode] = useState('');
  const [facName, setFacName] = useState('');
  const [facAddress, setFacAddress] = useState('');
  const [facManager, setFacManager] = useState('');
  const [facPhone, setFacPhone] = useState('');
  const [facStatus, setFacStatus] = useState<string>('ACTIVE');
  const [facAreaSqFt, setFacAreaSqFt] = useState<number>(45000);
  const [isSubmittingFac, setIsSubmittingFac] = useState(false);

  // Storage Zone Management Modal state
  const [showZoneModal, setShowZoneModal] = useState(false);
  const [editingZone, setEditingZone] = useState<StorageZone | null>(null);
  const [zoneCode, setZoneCode] = useState('');
  const [zoneTitle, setZoneTitle] = useState('');
  const [zoneTemp, setZoneTemp] = useState('');
  const [zoneDesc, setZoneDesc] = useState('');
  const [zoneAisle, setZoneAisle] = useState('');
  const [zoneIcon, setZoneIcon] = useState('📦');
  const [zoneThemeColor, setZoneThemeColor] = useState('emerald');
  const [zoneFacilityId, setZoneFacilityId] = useState('MAIN-DC');
  const [zoneMaxCapacity, setZoneMaxCapacity] = useState<number>(50000);
  const [isSubmittingZone, setIsSubmittingZone] = useState(false);

  // Catcher Gourmet Internal Sheet Balance Matrix filter states
  const [matrixSelectedMonth, setMatrixSelectedMonth] = useState<string>('AUG'); // 'ALL' | 'JAN' | 'FEB' ... 'DEC'
  const [matrixFilterMode, setMatrixFilterMode] = useState<'MONTH' | 'CUSTOM_DATE'>('MONTH');
  const [matrixStartDate, setMatrixStartDate] = useState<string>('2026-08-01');
  const [matrixEndDate, setMatrixEndDate] = useState<string>('2026-08-31');
  const [matrixCategoryFilter, setMatrixCategoryFilter] = useState<string>('ALL');
  const [matrixSearchQuery, setMatrixSearchQuery] = useState<string>('');

  // Purchase Orders state
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [selectedPoSku, setSelectedPoSku] = useState<ProductSKU | null>(null);
  const [poOrderQty, setPoOrderQty] = useState<number>(100);
  const [poUnitCost, setPoUnitCost] = useState<number>(15.0);
  const [poSupplier, setPoSupplier] = useState<string>('Premier Global Logistics');
  const [poDeliveryDate, setPoDeliveryDate] = useState<string>('');
  const [poNotes, setPoNotes] = useState<string>('');
  const [isGeneratingPo, setIsGeneratingPo] = useState(false);
  const [poSuccessToast, setPoSuccessToast] = useState<string | null>(null);

  // Global Refresh State & Handler
  const [isRefreshing, setIsRefreshing] = useState(false);
  const handleRefreshData = async () => {
    setIsRefreshing(true);
    try {
      if (onRefresh) {
        await onRefresh();
      }
    } catch (err) {
      console.error('Failed to refresh inventory:', err);
    } finally {
      setTimeout(() => setIsRefreshing(false), 500);
    }
  };

  // Categories list - strictly synced with database SKUs & Batches
  const categoriesList = useMemo(() => {
    const existingFromSkus = skus.map((s) => s.category).filter(Boolean);
    const existingFromBatches = batches.map((b) => b.category).filter(Boolean);
    const deletedSet = new Set((deletedCategories || []).map((c) => c.toLowerCase()));

    const combined = Array.from(new Set([...existingFromSkus, ...existingFromBatches])).filter(
      (cat) => !deletedSet.has(cat.toLowerCase())
    );

    if (combined.length === 0) {
      return ['General Products'];
    }

    return combined.sort();
  }, [skus, batches, deletedCategories]);

  // Create SKU state
  const [showCreateSkuModal, setShowCreateSkuModal] = useState(false);
  const [skuCode, setSkuCode] = useState('');
  const [skuName, setSkuName] = useState('');
  const [skuCategory, setSkuCategory] = useState(categoriesList[0] || 'General Products');
  const [isCustomCreateCategoryMode, setIsCustomCreateCategoryMode] = useState(false);
  const [customCreateCategoryInput, setCustomCreateCategoryInput] = useState('');
  const [skuDescription, setSkuDescription] = useState('');
  const [skuUnit, setSkuUnit] = useState('cases');
  const [skuReorderPoint, setSkuReorderPoint] = useState<number>(100);
  const [skuSafetyStock, setSkuSafetyStock] = useState<number>(50);
  const [skuBarcode, setSkuBarcode] = useState('');
  const [skuStorageZone, setSkuStorageZone] = useState<'COLD_STORAGE' | 'HIGH_VELOCITY' | 'DRY' | 'HAZMAT'>('DRY');
  const [isSubmittingSku, setIsSubmittingSku] = useState(false);

  // Edit SKU state
  const [showEditSkuModal, setShowEditSkuModal] = useState(false);
  const [editingSku, setEditingSku] = useState<ProductSKU | null>(null);
  const [editSkuName, setEditSkuName] = useState('');
  const [editSkuCategory, setEditSkuCategory] = useState('');
  const [isCustomEditCategoryMode, setIsCustomEditCategoryMode] = useState(false);
  const [customEditCategoryInput, setCustomEditCategoryInput] = useState('');
  const [editSkuDescription, setEditSkuDescription] = useState('');
  const [editSkuUnit, setEditSkuUnit] = useState('cases');
  const [editSkuReorderPoint, setEditSkuReorderPoint] = useState<number>(100);
  const [editSkuSafetyStock, setEditSkuSafetyStock] = useState<number>(50);
  const [editSkuStorageZone, setEditSkuStorageZone] = useState<'COLD_STORAGE' | 'HIGH_VELOCITY' | 'DRY' | 'HAZMAT'>('DRY');
  const [isSubmittingEditSku, setIsSubmittingEditSku] = useState(false);

  // CSV Import state
  const [showCsvImportModal, setShowCsvImportModal] = useState(false);

  // Stock Take Adjustment state
  const [showStockTakeModal, setShowStockTakeModal] = useState(false);
  const [stockTakeSku, setStockTakeSku] = useState('');
  const [stockTakeBatchNo, setStockTakeBatchNo] = useState('');
  const [stockTakeType, setStockTakeType] = useState<'SET_EXACT' | 'ADD' | 'SUBTRACT'>('SET_EXACT');
  const [stockTakeCountedQty, setStockTakeCountedQty] = useState<number | string>(0);
  const [stockTakeReason, setStockTakeReason] = useState('CYCLE_COUNT');
  const [stockTakeNotes, setStockTakeNotes] = useState('');
  const [isSubmittingStockTake, setIsSubmittingStockTake] = useState(false);

  const handleOpenStockTakeModal = (initialSku?: string, initialBatchNo?: string) => {
    const selectedSkuCode = initialSku || (skus.length > 0 ? skus[0].sku : '');
    setStockTakeSku(selectedSkuCode);
    setStockTakeBatchNo(initialBatchNo || '');
    setStockTakeType('SET_EXACT');

    const targetSku = skus.find((s) => s.sku === selectedSkuCode);
    const targetBatch = initialBatchNo ? batches.find((b) => b.batchNo === initialBatchNo) : null;
    const currentQty = targetBatch ? targetBatch.quantityOnHand : (targetSku?.exactQty ?? targetSku?.currentQty ?? 0);

    setStockTakeCountedQty(currentQty);
    setStockTakeReason('CYCLE_COUNT');
    setStockTakeNotes('');
    setShowStockTakeModal(true);
  };

  const handleStockTakeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stockTakeSku) {
      alert('Please select a valid SKU.');
      return;
    }
    const countedVal = Number(stockTakeCountedQty);
    if (isNaN(countedVal) || countedVal < 0) {
      alert('Please enter a valid non-negative quantity.');
      return;
    }

    setIsSubmittingStockTake(true);
    try {
      const res = await adjustStock({
        sku: stockTakeSku,
        batchNo: stockTakeBatchNo || undefined,
        adjustmentType: stockTakeType,
        countedQuantity: countedVal,
        reasonCode: stockTakeReason,
        notes: stockTakeNotes,
        operator: `${currentUser.name} (${currentUser.role})`
      });

      if (onLogAuditActivity) {
        onLogAuditActivity(
          'INVENTORY',
          'STOCK_ADJUSTED',
          `SKU ${stockTakeSku}`,
          `Stock Take Adjustment on ${stockTakeSku} (Variance: ${res.variance >= 0 ? '+' : ''}${res.variance} units). Reason: ${stockTakeReason}. Notes: ${stockTakeNotes || 'None'}`,
          res.variance === 0 ? 'INFO' : 'WARNING'
        );
      }

      const varianceText = res.variance >= 0 ? `+${res.variance}` : `${res.variance}`;
      setPoSuccessToast(`✅ Stock Take Adjustment saved for ${stockTakeSku}! Net Variance: ${varianceText} units.`);
      setShowStockTakeModal(false);
      onRefresh();
      setTimeout(() => setPoSuccessToast(null), 5000);
    } catch (err: any) {
      alert(`Stock Take Adjustment failed: ${err.message}`);
    } finally {
      setIsSubmittingStockTake(false);
    }
  };

  // Global Rename Category state
  const [showRenameCategoryModal, setShowRenameCategoryModal] = useState(false);
  const [renameOldCategory, setRenameOldCategory] = useState('');
  const [renameNewCategory, setRenameNewCategory] = useState('');
  const [showConfirmDeleteCategory, setShowConfirmDeleteCategory] = useState(false);
  const [isSubmittingRenameCategory, setIsSubmittingRenameCategory] = useState(false);

  // General Delete Confirmation Modal State
  const [deleteConfirmTarget, setDeleteConfirmTarget] = useState<{
    type: 'PO' | 'LOCATION' | 'FACILITY' | 'ZONE' | 'STOCK_MOVEMENTS';
    id: string;
    title: string;
    subtitle?: string;
    onConfirm: () => Promise<void>;
  } | null>(null);
  const [isDeletingTarget, setIsDeletingTarget] = useState(false);

  const handleClearStockMovementsClick = () => {
    setDeleteConfirmTarget({
      type: 'STOCK_MOVEMENTS',
      id: 'STREAM_ALL',
      title: 'Clear Stock Movement Stream Logs',
      subtitle: `Are you sure you want to permanently clear all ${stockMovements.length} recorded stock movement log entries?`,
      onConfirm: async () => {
        const res = await clearStockMovements();
        if (onLogAuditActivity) {
          onLogAuditActivity(
            'INVENTORY',
            'STOCK_MOVEMENTS_CLEARED',
            'Stock Movement Stream',
            `Cleared ${res.clearedCount} stock movement logs.`,
            'WARNING'
          );
        }
        setPoSuccessToast(`🗑️ Cleared ${res.clearedCount} stock movement records from stream!`);
        if (onRefresh) onRefresh();
      }
    });
  };

  const [isSyncingMatrix, setIsSyncingMatrix] = useState(false);

  const handleSyncMatrixWithDatabase = async () => {
    setIsSyncingMatrix(true);
    try {
      const res = await syncCatcherGourmetMatrix();
      if (onLogAuditActivity) {
        onLogAuditActivity(
          'INVENTORY',
          'MATRIX_SYNCED',
          'Catcher Gourmet Internal Sheet Balance Matrix',
          `Synchronized ${skus.length} SKUs in internal balance sheet matrix with database.`
        );
      }
      setPoSuccessToast(`🔄 Catcher Gourmet Matrix synchronized with database! (${res.skus?.length || skus.length} SKUs updated)`);
      if (onRefresh) onRefresh();
    } catch (err: any) {
      alert(`Sync failed: ${err.message || 'Server error'}`);
    } finally {
      setIsSyncingMatrix(false);
    }
  };

  const handleOpenRenameCategoryModal = (initialCategory?: string) => {
    const initCat = initialCategory || categoriesList[0] || 'General Products';
    setRenameOldCategory(initCat);
    setRenameNewCategory(initCat);
    setShowConfirmDeleteCategory(false);
    setShowRenameCategoryModal(true);
  };

  const handleRenameCategorySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!renameOldCategory || !renameNewCategory) return;
    if (renameOldCategory.trim().toLowerCase() === renameNewCategory.trim().toLowerCase()) {
      alert('The new category name is identical to the current category name.');
      return;
    }

    setIsSubmittingRenameCategory(true);
    try {
      const res = await renameCategory(renameOldCategory, renameNewCategory);
      if (onLogAuditActivity) {
        onLogAuditActivity(
          'INVENTORY',
          'CATEGORY_RENAMED',
          `Category ${renameOldCategory}`,
          `Renamed category '${renameOldCategory}' to '${renameNewCategory}' across ${res.updatedSkusCount} SKUs and ${res.updatedBatchesCount} batches.`,
          'INFO'
        );
      }
      setPoSuccessToast(`✅ Category '${renameOldCategory}' renamed to '${renameNewCategory}' across ${res.updatedSkusCount} SKUs!`);
      setShowRenameCategoryModal(false);
      setShowConfirmDeleteCategory(false);
      onRefresh();
      setTimeout(() => setPoSuccessToast(null), 5000);
    } catch (err: any) {
      alert(`Category rename failed: ${err.message}`);
    } finally {
      setIsSubmittingRenameCategory(false);
    }
  };

  const handleDeleteCategorySubmit = async () => {
    if (!renameOldCategory) return;

    setIsSubmittingRenameCategory(true);
    try {
      const res = await deleteCategory(renameOldCategory, 'General Products');
      if (onLogAuditActivity) {
        onLogAuditActivity(
          'INVENTORY',
          'CATEGORY_DELETED',
          `Category ${renameOldCategory}`,
          `Deleted category '${renameOldCategory}' and reassigned ${res.updatedSkusCount} SKUs to 'General Products'.`,
          'WARNING'
        );
      }
      setPoSuccessToast(`🗑️ Category '${renameOldCategory}' deleted! Reassigned ${res.updatedSkusCount} SKUs to 'General Products'.`);
      setShowRenameCategoryModal(false);
      setShowConfirmDeleteCategory(false);
      onRefresh();
      setTimeout(() => setPoSuccessToast(null), 5000);
    } catch (err: any) {
      alert(`Category deletion failed: ${err.message}`);
    } finally {
      setIsSubmittingRenameCategory(false);
    }
  };

  // Facility & Location Handler Functions
  const handleOpenCreateLocationModal = () => {
    setEditingLocation(null);
    setLocAisle('A');
    setLocRack(1);
    setLocShelf(1);
    setLocBin('01');
    setLocZone('DRY');
    setLocCapacityKg(500);
    setShowLocationModal(true);
  };

  const handleOpenEditLocationModal = (loc: Location) => {
    setEditingLocation(loc);
    setLocAisle(loc.aisle);
    setLocRack(loc.rack);
    setLocShelf(loc.shelf);
    setLocBin(loc.bin);
    setLocZone(loc.zone);
    setLocCapacityKg(loc.capacityKg || 500);
    setShowLocationModal(true);
  };

  const handleSaveLocationSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmittingLoc(true);
    try {
      if (editingLocation) {
        await updateLocation(editingLocation.id, {
          zone: locZone,
          capacityKg: locCapacityKg
        });
        setPoSuccessToast(`✅ Location '${editingLocation.id}' updated successfully!`);
      } else {
        const res = await createLocation({
          aisle: locAisle,
          rack: locRack,
          shelf: locShelf,
          bin: locBin,
          zone: locZone,
          capacityKg: locCapacityKg
        });
        setPoSuccessToast(`✅ Putaway Bin Location '${res.location.id}' created successfully!`);
      }
      setShowLocationModal(false);
      onRefresh();
      setTimeout(() => setPoSuccessToast(null), 5000);
    } catch (err: any) {
      alert(`Location action failed: ${err.message}`);
    } finally {
      setIsSubmittingLoc(false);
    }
  };

  const handleDeleteLocationClick = (locId: string) => {
    setDeleteConfirmTarget({
      type: 'LOCATION',
      id: locId,
      title: `Putaway Bin Location '${locId}'`,
      subtitle: 'Permanently remove this putaway bin location from the facility map.',
      onConfirm: async () => {
        await deleteLocation(locId);
        setPoSuccessToast(`🗑️ Putaway Bin Location '${locId}' deleted!`);
        onRefresh();
        setTimeout(() => setPoSuccessToast(null), 5000);
      }
    });
  };

  // Facility Management CRUD Handlers
  const handleOpenCreateFacilityModal = () => {
    setEditingFacility(null);
    setFacCode(`FAC-${Math.floor(100 + Math.random() * 900)}`);
    setFacName('');
    setFacAddress('');
    setFacManager(currentUser.name);
    setFacPhone('+1 (555) 019-2834');
    setFacStatus('ACTIVE');
    setFacAreaSqFt(35000);
    setShowFacilityModal(true);
  };

  const handleOpenEditFacilityModal = (fac: WarehouseFacility) => {
    setEditingFacility(fac);
    setFacCode(fac.code);
    setFacName(fac.name);
    setFacAddress(fac.address || '');
    setFacManager(fac.managerName || '');
    setFacPhone(fac.contactPhone || '');
    setFacStatus(fac.status || 'ACTIVE');
    setFacAreaSqFt(fac.totalAreaSqFt || 45000);
    setShowFacilityModal(true);
  };

  const handleSaveFacilitySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmittingFac(true);
    try {
      if (editingFacility) {
        await updateFacility(editingFacility.id, {
          code: facCode,
          name: facName,
          address: facAddress,
          managerName: facManager,
          contactPhone: facPhone,
          status: facStatus,
          totalAreaSqFt: Number(facAreaSqFt)
        });
        if (onLogAuditActivity) {
          onLogAuditActivity(
            'FACILITIES',
            'FACILITY_UPDATE',
            `Facility ${facCode}`,
            `Updated warehouse facility ${facName} (${facCode}).`,
            'INFO'
          );
        }
        setPoSuccessToast(`✅ Facility '${facName}' updated successfully!`);
      } else {
        await createFacility({
          code: facCode,
          name: facName,
          address: facAddress,
          managerName: facManager,
          contactPhone: facPhone,
          status: facStatus,
          totalAreaSqFt: Number(facAreaSqFt)
        });
        if (onLogAuditActivity) {
          onLogAuditActivity(
            'FACILITIES',
            'FACILITY_CREATE',
            `Facility ${facCode}`,
            `Created new warehouse facility ${facName} (${facCode}).`,
            'INFO'
          );
        }
        setPoSuccessToast(`✅ Facility '${facName}' created successfully!`);
      }
      setShowFacilityModal(false);
      onRefresh();
      setTimeout(() => setPoSuccessToast(null), 5000);
    } catch (err: any) {
      alert(`Error saving facility: ${err.message}`);
    } finally {
      setIsSubmittingFac(false);
    }
  };

  const handleDeleteFacilityClick = (id: string, name: string) => {
    setDeleteConfirmTarget({
      type: 'FACILITY',
      id: id,
      title: `Warehouse Facility '${name}'`,
      subtitle: `Facility ID: ${id}`,
      onConfirm: async () => {
        await deleteFacility(id);
        if (onLogAuditActivity) {
          onLogAuditActivity(
            'FACILITIES',
            'FACILITY_DELETE',
            `Facility ID ${id}`,
            `Deleted warehouse facility ${name}.`,
            'WARNING'
          );
        }
        setPoSuccessToast(`🗑️ Warehouse Facility '${name}' deleted!`);
        onRefresh();
        setTimeout(() => setPoSuccessToast(null), 5000);
      }
    });
  };

  // Storage Zone Management CRUD Handlers
  const handleOpenCreateZoneModal = () => {
    setEditingZone(null);
    setZoneCode('');
    setZoneTitle('');
    setZoneTemp('18°C to 24°C Ambient');
    setZoneDesc('');
    setZoneAisle('Aisle E');
    setZoneIcon('📦');
    setZoneThemeColor('emerald');
    setZoneFacilityId(facilities[0]?.id || 'MAIN-DC');
    setZoneMaxCapacity(50000);
    setShowZoneModal(true);
  };

  const handleOpenEditZoneModal = (z: StorageZone) => {
    setEditingZone(z);
    setZoneCode(z.code);
    setZoneTitle(z.title);
    setZoneTemp(z.temperatureRange || '');
    setZoneDesc(z.description || '');
    setZoneAisle(z.aisle || '');
    setZoneIcon(z.icon || '📦');
    setZoneThemeColor(z.themeColor || 'emerald');
    setZoneFacilityId(z.facilityId || 'MAIN-DC');
    setZoneMaxCapacity(z.maxCapacityKg || 50000);
    setShowZoneModal(true);
  };

  const handleSaveZoneSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmittingZone(true);
    try {
      if (editingZone) {
        await updateZone(editingZone.code, {
          title: zoneTitle,
          temperatureRange: zoneTemp,
          description: zoneDesc,
          aisle: zoneAisle,
          icon: zoneIcon,
          themeColor: zoneThemeColor,
          facilityId: zoneFacilityId,
          maxCapacityKg: Number(zoneMaxCapacity)
        });
        if (onLogAuditActivity) {
          onLogAuditActivity(
            'FACILITIES',
            'ZONE_UPDATE',
            `Zone ${editingZone.code}`,
            `Updated storage zone ${zoneTitle} (${editingZone.code}).`,
            'INFO'
          );
        }
        setPoSuccessToast(`✅ Storage Zone '${zoneTitle}' updated successfully!`);
      } else {
        const codeKey = zoneCode.trim().toUpperCase().replace(/\s+/g, '_');
        await createZone({
          code: codeKey,
          title: zoneTitle,
          temperatureRange: zoneTemp,
          description: zoneDesc,
          aisle: zoneAisle,
          icon: zoneIcon,
          themeColor: zoneThemeColor,
          facilityId: zoneFacilityId,
          maxCapacityKg: Number(zoneMaxCapacity)
        });
        if (onLogAuditActivity) {
          onLogAuditActivity(
            'FACILITIES',
            'ZONE_CREATE',
            `Zone ${codeKey}`,
            `Created new storage zone ${zoneTitle} (${codeKey}).`,
            'INFO'
          );
        }
        setPoSuccessToast(`✅ Storage Zone '${zoneTitle}' created successfully!`);
      }
      setShowZoneModal(false);
      onRefresh();
      setTimeout(() => setPoSuccessToast(null), 5000);
    } catch (err: any) {
      alert(`Error saving storage zone: ${err.message}`);
    } finally {
      setIsSubmittingZone(false);
    }
  };

  const handleDeleteZoneClick = (code: string, title: string) => {
    setDeleteConfirmTarget({
      type: 'ZONE',
      id: code,
      title: `Storage Zone '${title}'`,
      subtitle: `Zone Code: ${code}`,
      onConfirm: async () => {
        await deleteZone(code);
        if (onLogAuditActivity) {
          onLogAuditActivity(
            'FACILITIES',
            'ZONE_DELETE',
            `Zone ${code}`,
            `Deleted storage zone ${title}.`,
            'WARNING'
          );
        }
        setPoSuccessToast(`🗑️ Storage Zone '${title}' deleted!`);
        onRefresh();
        setTimeout(() => setPoSuccessToast(null), 5000);
      }
    });
  };

  const handleOpenEditSkuModal = (sku: ProductSKU) => {
    setEditingSku(sku);
    setEditSkuName(sku.name);
    setEditSkuCategory(sku.category);
    setIsCustomEditCategoryMode(false);
    setCustomEditCategoryInput('');
    setEditSkuDescription(sku.description || '');
    setEditSkuUnit(sku.unit || 'cases');
    setEditSkuReorderPoint(sku.reorderPoint);
    setEditSkuSafetyStock(sku.safetyStock);
    setEditSkuStorageZone(sku.storageZone || 'DRY');
    setShowEditSkuModal(true);
  };

  const handleEditSkuSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSku) return;

    const finalCategory = (isCustomEditCategoryMode ? customEditCategoryInput : editSkuCategory).trim();
    if (!finalCategory) {
      alert('Please enter or select a valid Category.');
      return;
    }

    setIsSubmittingEditSku(true);
    try {
      const updated = await updateSKU(editingSku.sku, {
        name: editSkuName,
        category: finalCategory,
        description: editSkuDescription,
        unit: editSkuUnit,
        reorderPoint: Number(editSkuReorderPoint),
        safetyStock: Number(editSkuSafetyStock),
        storageZone: editSkuStorageZone
      });

      if (onLogAuditActivity) {
        onLogAuditActivity(
          'INVENTORY',
          'SKU_UPDATED',
          `SKU ${updated.sku}`,
          `Updated SKU '${updated.sku}' category to '${updated.category}'.`,
          'INFO'
        );
      }

      setPoSuccessToast(`✅ SKU '${updated.sku}' updated! Category set to '${updated.category}'.`);
      setShowEditSkuModal(false);
      setEditingSku(null);
      onRefresh();
      setTimeout(() => setPoSuccessToast(null), 5000);
    } catch (err: any) {
      alert(`SKU update failed: ${err.message}`);
    } finally {
      setIsSubmittingEditSku(false);
    }
  };

  const handleCreateSkuSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const finalCategory = (isCustomCreateCategoryMode ? customCreateCategoryInput : skuCategory).trim();
    if (!skuCode || !skuName || !finalCategory) {
      alert('Please fill out SKU Code, Product Name, and Category.');
      return;
    }
    setIsSubmittingSku(true);
    try {
      const created = await createSKU({
        sku: skuCode,
        name: skuName,
        category: finalCategory,
        description: skuDescription,
        unit: skuUnit,
        reorderPoint: Number(skuReorderPoint),
        safetyStock: Number(skuSafetyStock),
        barcode: skuBarcode || `890${Math.floor(100000000 + Math.random() * 900000000)}`,
        storageZone: skuStorageZone
      });

      if (onLogAuditActivity) {
        onLogAuditActivity(
          'INVENTORY',
          'SKU_CREATED',
          `SKU ${created.sku}`,
          `New SKU '${created.sku}' (${created.name}) created in master catalog under category '${created.category}'.`,
          'INFO'
        );
      }

      setPoSuccessToast(`✅ SKU '${created.sku}' (${created.name}) successfully added under '${created.category}'!`);
      setShowCreateSkuModal(false);
      setSkuCode('');
      setSkuName('');
      setSkuDescription('');
      setSkuBarcode('');
      setIsCustomCreateCategoryMode(false);
      setCustomCreateCategoryInput('');
      onRefresh();
      setTimeout(() => setPoSuccessToast(null), 5000);
    } catch (err: any) {
      alert(`SKU Creation failed: ${err.message}`);
    } finally {
      setIsSubmittingSku(false);
    }
  };

  // Filtered SKUs for Catcher Gourmet Matrix
  const filteredMatrixSkus = useMemo(() => {
    return skus.filter((item) => {
      const matchesSearch =
        matrixSearchQuery === '' ||
        item.sku.toLowerCase().includes(matrixSearchQuery.toLowerCase()) ||
        item.name.toLowerCase().includes(matrixSearchQuery.toLowerCase());

      const matchesCat =
        matrixCategoryFilter === 'ALL' || item.category === matrixCategoryFilter;

      return matchesSearch && matchesCat;
    });
  }, [skus, matrixSearchQuery, matrixCategoryFilter]);

  // Calculate dynamic row values based on matrixFilterMode (MONTH vs CUSTOM_DATE)
  const matrixRowsData = useMemo(() => {
    return filteredMatrixSkus.map((skuItem) => {
      const baseStockIn = skuItem.stockIn ?? 0;
      const baseStockOut = skuItem.stockOut ?? 0;
      const reserved = skuItem.reserved ?? 0;
      const baseExactQty = skuItem.exactQty ?? (baseStockIn - baseStockOut - reserved);
      const balForward = skuItem.balanceForward ?? skuItem.currentQty ?? 0;
      const months = skuItem.monthlyBalances || {};

      if (matrixFilterMode === 'CUSTOM_DATE') {
        const start = matrixStartDate;
        const end = matrixEndDate;
        const movementsInRange = stockMovements.filter((mov) => {
          if (mov.sku !== skuItem.sku) return false;
          const movDate = mov.timestamp ? mov.timestamp.substring(0, 10) : '';
          return movDate >= start && movDate <= end;
        });

        let rangeIn = 0;
        let rangeOut = 0;
        movementsInRange.forEach((m) => {
          if (m.type === 'INBOUND_RECEIVE' || m.type === 'PUTAWAY') {
            rangeIn += m.quantity;
          } else if (m.type === 'PICKING' || m.type === 'DISPATCH') {
            rangeOut += m.quantity;
          }
        });

        // Use computed date range movements if available, or base stock if no logged movements in range
        const stockIn = rangeIn;
        const stockOut = rangeOut;
        const exactQty = movementsInRange.length > 0 ? (rangeIn - rangeOut) : baseExactQty;

        return {
          skuItem,
          stockIn,
          stockOut,
          reserved,
          exactQty,
          balForward,
          months,
          focusVal: exactQty,
          movementCount: movementsInRange.length,
          hasMovementsInRange: movementsInRange.length > 0
        };
      } else {
        // Month mode
        const monthVal = matrixSelectedMonth !== 'ALL' ? months[matrixSelectedMonth] : undefined;
        return {
          skuItem,
          stockIn: baseStockIn,
          stockOut: baseStockOut,
          reserved,
          exactQty: baseExactQty,
          balForward,
          months,
          focusVal: monthVal !== undefined ? monthVal : baseExactQty,
          movementCount: 0,
          hasMovementsInRange: false
        };
      }
    });
  }, [filteredMatrixSkus, matrixFilterMode, matrixStartDate, matrixEndDate, matrixSelectedMonth, stockMovements]);

  // Matrix KPI Metrics Calculation
  const matrixKPIs = useMemo(() => {
    let totalInbound = 0;
    let totalOutbound = 0;
    let totalValue = 0;
    let totalExactQty = 0;

    matrixRowsData.forEach((row) => {
      const cost = row.skuItem.unitCost ?? 14.5;
      totalInbound += row.stockIn;
      totalOutbound += row.stockOut;
      totalExactQty += row.exactQty;
      totalValue += row.exactQty * cost;
    });

    return {
      totalInbound,
      totalOutbound,
      totalExactQty,
      totalValue,
      count: matrixRowsData.length
    };
  }, [matrixRowsData]);

  // Handle Export Catcher Gourmet Internal Sheet Balance Matrix as CSV
  const handleExportMatrixCsv = () => {
    const headers = [
      'SKU Code',
      'Item Description',
      'Category',
      'Stock In',
      'Stock Out',
      'Reserved',
      'Exact Qty',
      'Bal Forward',
      matrixFilterMode === 'MONTH' ? `Month (${matrixSelectedMonth}) Balance` : `Custom Date Range (${matrixStartDate} to ${matrixEndDate}) Balance`,
      'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'
    ];

    const rows = matrixRowsData.map((row) => {
      const { skuItem, stockIn, stockOut, reserved, exactQty, balForward, months, focusVal } = row;

      return [
        `"${skuItem.sku}"`,
        `"${skuItem.name.replace(/"/g, '""')}"`,
        `"${skuItem.category}"`,
        stockIn,
        stockOut,
        reserved,
        exactQty,
        balForward,
        focusVal,
        months['JAN'] ?? '-',
        months['FEB'] ?? '-',
        months['MAR'] ?? '-',
        months['APR'] ?? '-',
        months['MAY'] ?? '-',
        months['JUN'] ?? '-',
        months['JUL'] ?? '-',
        months['AUG'] ?? '-',
        months['SEP'] ?? '-',
        months['OCT'] ?? '-',
        months['NOV'] ?? '-',
        months['DEC'] ?? '-'
      ].join(',');
    });

    const csvData = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    const dateTag = matrixFilterMode === 'MONTH' ? `Month_${matrixSelectedMonth}` : `Dates_${matrixStartDate}_to_${matrixEndDate}`;
    link.setAttribute('download', `Catcher_Gourmet_Internal_Sheet_Balance_Matrix_${dateTag}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    if (onLogAuditActivity) {
      onLogAuditActivity(
        'INVENTORY',
        'EXPORT_CSV',
        'CATCHER_GOURMET_MATRIX',
        `Exported Catcher Gourmet Internal Sheet Balance Matrix for ${dateTag}`,
        'INFO'
      );
    }
  };

  // Permissions
  const canReceiveInbound = hasPermission(currentUser.role, 'inbound:receive', customRolePermissions);
  const canManageQuarantine = hasPermission(currentUser.role, 'quarantine:manage', customRolePermissions);
  const [permissionWarning, setPermissionWarning] = useState<string | null>(null);

  // Inbound Form state
  const [inboundSku, setInboundSku] = useState(skus[0]?.sku || 'SKU-DAIRY-101');
  const [inboundCategory, setInboundCategory] = useState(skus[0]?.category || 'General Products');

  const selectedInboundSkuObj = useMemo(() => {
    return skus.find((s) => s.sku === inboundSku) || skus[0];
  }, [skus, inboundSku]);

  // Keep inboundCategory synced with selected SKU if SKU changes
  const handleInboundSkuChange = (newSkuCode: string) => {
    setInboundSku(newSkuCode);
    const matched = skus.find((s) => s.sku === newSkuCode);
    if (matched && matched.category) {
      setInboundCategory(matched.category);
    }
  };
  const [inboundBatchNo, setInboundBatchNo] = useState(`B2608-${Math.floor(1000 + Math.random() * 9000)}`);
  const [inboundBbd, setInboundBbd] = useState('2026-09-15');
  const [inboundSupplier, setInboundSupplier] = useState('Premier Global Logistics');
  const [inboundLocationId, setInboundLocationId] = useState(locations[0]?.id || 'A-01-01');
  const [inboundQty, setInboundQty] = useState<number>(50);
  const [inboundUnitCost, setInboundUnitCost] = useState<number>(12.50);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Load Purchase Orders
  useEffect(() => {
    fetchPurchaseOrders().then((pos) => setPurchaseOrders(pos));
  }, []);

  // Calculate total on-hand stock per SKU across all active batches
  const skuStockMap = useMemo(() => {
    const map = new Map<string, { totalOnHand: number; totalAvailable: number; primarySupplier: string }>();
    skus.forEach((s) => map.set(s.sku, { totalOnHand: 0, totalAvailable: 0, primarySupplier: 'Premier Global Logistics' }));
    
    batches.forEach((b) => {
      const existing = map.get(b.sku) || { totalOnHand: 0, totalAvailable: 0, primarySupplier: b.supplier || 'Premier Global Logistics' };
      map.set(b.sku, {
        totalOnHand: existing.totalOnHand + (b.quantityOnHand || 0),
        totalAvailable: existing.totalAvailable + (b.quantityAvailable || 0),
        primarySupplier: b.supplier || existing.primarySupplier
      });
    });
    return map;
  }, [skus, batches]);

  // Identify SKUs that have reached or dropped below their reorder point
  const skusNeedingReorder = useMemo(() => {
    return skus.filter((sku) => {
      const stock = skuStockMap.get(sku.sku)?.totalOnHand || 0;
      return stock <= sku.reorderPoint;
    });
  }, [skus, skuStockMap]);

  // Filtered Batches
  const filteredBatches = batches.filter((batch) => {
    const matchesSearch =
      batch.sku.toLowerCase().includes(searchTerm.toLowerCase()) ||
      batch.itemName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      batch.batchNo.toLowerCase().includes(searchTerm.toLowerCase()) ||
      batch.locationId.toLowerCase().includes(searchTerm.toLowerCase()) ||
      batch.supplier.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus =
      selectedStatusFilter === 'ALL' ||
      (selectedStatusFilter === 'REORDER_NEEDED' && (skuStockMap.get(batch.sku)?.totalOnHand || 0) <= (skus.find((s) => s.sku === batch.sku)?.reorderPoint || 0)) ||
      (selectedStatusFilter === 'CRITICAL' && batch.expiryAlert === 'CRITICAL') ||
      (selectedStatusFilter === 'EXPIRING_SOON' && batch.expiryAlert === 'EXPIRING_SOON') ||
      (selectedStatusFilter === 'QUARANTINED' && batch.status === 'QUARANTINED') ||
      (selectedStatusFilter === 'HEALTHY' && batch.expiryAlert === 'HEALTHY' && batch.status === 'ACTIVE');

    const matchesZone =
      selectedZoneFilter === 'ALL' ||
      (batch.locationDetails && batch.locationDetails.zone === selectedZoneFilter);

    const matchesCategory =
      selectedCategoryFilter === 'ALL' || batch.category === selectedCategoryFilter;

    return matchesSearch && matchesStatus && matchesZone && matchesCategory;
  });

  // Filtered SKUs for Catalog view
  const filteredSkus = skus.filter((sku) => {
    const matchesSearch =
      sku.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      sku.sku.toLowerCase().includes(searchTerm.toLowerCase()) ||
      sku.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
      sku.barcode.toLowerCase().includes(searchTerm.toLowerCase());

    const stock = skuStockMap.get(sku.sku)?.totalOnHand || 0;
    const isLow = stock <= sku.reorderPoint;

    const matchesStatus =
      selectedStatusFilter === 'ALL' ||
      (selectedStatusFilter === 'REORDER_NEEDED' && isLow) ||
      (selectedStatusFilter === 'HEALTHY' && !isLow);

    const matchesZone = selectedZoneFilter === 'ALL' || sku.storageZone === selectedZoneFilter;

    const matchesCategory =
      selectedCategoryFilter === 'ALL' || sku.category === selectedCategoryFilter;

    return matchesSearch && matchesStatus && matchesZone && matchesCategory;
  });

  // KPI Calculations
  const totalStockUnits = batches.reduce((acc, b) => acc + b.quantityOnHand, 0);
  const criticalCount = batches.filter((b) => b.expiryAlert === 'CRITICAL').length;
  const quarantinedCount = batches.filter((b) => b.status === 'QUARANTINED').length;

  const handleOpenInbound = () => {
    if (!canReceiveInbound) {
      setPermissionWarning(`Role Security Guard: Active role '${currentUser.role}' lacks 'inbound:receive' permission. Only Receiver, Warehouse Manager, or Admin can receive inbound stock.`);
      return;
    }
    const currentSkuObj = skus.find((s) => s.sku === inboundSku) || skus[0];
    if (currentSkuObj) {
      setInboundSku(currentSkuObj.sku);
      setInboundCategory(currentSkuObj.category || categoriesList[0] || 'General Products');
    }
    setPermissionWarning(null);
    setShowInboundModal(true);
  };

  const handleOpenPoModal = (sku: ProductSKU) => {
    const currentStock = skuStockMap.get(sku.sku)?.totalOnHand || 0;
    const supplier = skuStockMap.get(sku.sku)?.primarySupplier || 'Premier Global Logistics';
    const matchingBatch = batches.find((b) => b.sku === sku.sku);
    const unitCost = matchingBatch?.unitCost || 14.50;
    
    // Suggested PO quantity = double reorder point minus current stock, rounded up to 25
    const recommendedQty = Math.max(50, Math.ceil((sku.reorderPoint * 2 - currentStock) / 25) * 25);
    const deliveryDate = new Date(Date.now() + 5 * 86400000).toISOString().split('T')[0];

    setSelectedPoSku(sku);
    setPoOrderQty(recommendedQty);
    setPoUnitCost(unitCost);
    setPoSupplier(supplier);
    setPoDeliveryDate(deliveryDate);
    setPoNotes(`Automated Purchase Order generated due to stock reaching reorder threshold (${currentStock} / ${sku.reorderPoint} ${sku.unit}).`);
  };

  const handleConfirmGeneratePo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPoSku) return;

    setIsGeneratingPo(true);
    try {
      const createdPo = await createPurchaseOrder({
        sku: selectedPoSku.sku,
        itemName: selectedPoSku.name,
        supplier: poSupplier,
        reorderQuantity: Number(poOrderQty),
        unitCost: Number(poUnitCost),
        expectedDeliveryDate: poDeliveryDate,
        generatedBy: `${currentUser.name} (${currentUser.role})`,
        destinationLocationId: locations.find((l) => l.zone === selectedPoSku.storageZone)?.id || 'A-01-01',
        notes: poNotes
      });

      if (onLogAuditActivity) {
        onLogAuditActivity(
          'INBOUND',
          'PURCHASE_ORDER_GENERATED',
          `SKU ${selectedPoSku.sku} (${selectedPoSku.name})`,
          `Issued Purchase Order ${createdPo.id} for ${poOrderQty} ${selectedPoSku.unit} to vendor ${poSupplier}. Total value: $${createdPo.totalCost.toFixed(2)}.`,
          'INFO'
        );
      }

      setPoSuccessToast(`Purchase Order ${createdPo.id} generated successfully for ${poOrderQty} ${selectedPoSku.unit} of ${selectedPoSku.name}! Total: $${createdPo.totalCost.toFixed(2)}.`);
      
      const updatedPos = await fetchPurchaseOrders();
      setPurchaseOrders(updatedPos);

      setIsGeneratingPo(false);
      setSelectedPoSku(null);

      setTimeout(() => setPoSuccessToast(null), 6000);
    } catch (err: any) {
      alert(`PO Generation failed: ${err.message || 'Error creating purchase order'}`);
      setIsGeneratingPo(false);
    }
  };

  const handleOpenInboundFromPo = (po: PurchaseOrder) => {
    const matchingCategory = po.category || skus.find((s) => s.sku === po.sku)?.category || categoriesList[0] || 'General Products';
    setInboundCategory(matchingCategory);
    setInboundSku(po.sku);
    setInboundBatchNo(`B2608-${po.sku.split('-').pop()}-${Math.floor(100 + Math.random() * 900)}`);
    setInboundSupplier(po.supplier);
    setInboundQty(po.reorderQuantity);
    setInboundUnitCost(po.unitCost);
    setInboundLocationId(po.destinationLocationId || locations[0]?.id || 'A-01-01');
    setInboundBbd(new Date(Date.now() + 180 * 86400000).toISOString().split('T')[0]);
    setShowInboundModal(true);
  };

  const handleDeletePurchaseOrder = (po: PurchaseOrder) => {
    setDeleteConfirmTarget({
      type: 'PO',
      id: po.id,
      title: `Purchase Order ${po.id}`,
      subtitle: `${po.reorderQuantity} units of ${po.itemName} (${po.sku}) — Supplier: ${po.supplier}`,
      onConfirm: async () => {
        await deletePurchaseOrder(po.id);
        setPurchaseOrders((prev) => prev.filter((p) => p.id !== po.id));
        if (onLogAuditActivity) {
          onLogAuditActivity(
            'INBOUND',
            'PURCHASE_ORDER_DELETED',
            `PO ${po.id}`,
            `Deleted purchase order ${po.id} from replenishment stream.`
          );
        }
        setPoSuccessToast(`🗑️ Purchase Order '${po.id}' deleted successfully!`);
        if (onRefresh) onRefresh();
      }
    });
  };

  const handleInboundSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canReceiveInbound) return;
    setIsSubmitting(true);
    setFeedbackMsg(null);

    try {
      await receiveInboundStock({
        sku: inboundSku,
        category: inboundCategory,
        batchNo: inboundBatchNo,
        manufactureDate: new Date().toISOString().split('T')[0],
        bestBeforeDate: inboundBbd,
        supplier: inboundSupplier,
        locationId: inboundLocationId,
        quantity: Number(inboundQty)
      });

      if (onLogAuditActivity) {
        onLogAuditActivity(
          'INBOUND',
          'STOCK_INBOUND_RECEIVE',
          `Batch ${inboundBatchNo}`,
          `Received ${inboundQty} units of SKU ${inboundSku} into Bin ${inboundLocationId} (Supplier: ${inboundSupplier}, BBD: ${inboundBbd}).`,
          'INFO'
        );
      }

      setFeedbackMsg({ type: 'success', text: `Batch ${inboundBatchNo} received successfully!` });
      setTimeout(() => {
        setShowInboundModal(false);
        onRefresh();
        setFeedbackMsg(null);
      }, 1200);
    } catch (err: any) {
      setFeedbackMsg({ type: 'error', text: err.message || 'Receiving failed' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleQuarantine = async (batchNo: string) => {
    if (!canManageQuarantine) {
      setPermissionWarning(`Role Security Guard: Active role '${currentUser.role}' lacks 'quarantine:manage' permission. Only Warehouse Manager or Admin can alter batch quarantine status.`);
      return;
    }
    setPermissionWarning(null);
    try {
      await toggleBatchQuarantine(batchNo, 'Manual QA Audit Toggle');
      if (onLogAuditActivity) {
        onLogAuditActivity(
          'QUARANTINE',
          'BATCH_QUARANTINE_TOGGLE',
          `Batch ${batchNo}`,
          `Toggled quarantine status for lot ${batchNo} (QA Safety Override by ${currentUser.name}).`,
          'CRITICAL'
        );
      }
      onRefresh();
    } catch (err: any) {
      alert(`Quarantine action failed: ${err.message}`);
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Toast Banner for PO creation */}
      {poSuccessToast && (
        <div className="bg-emerald-50 border border-emerald-300 p-4 rounded-xl text-xs text-emerald-900 flex items-center justify-between shadow-md animate-fade-in">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
            <span className="font-semibold">{poSuccessToast}</span>
          </div>
          <button onClick={() => setPoSuccessToast(null)} className="text-emerald-700 hover:text-emerald-950 font-bold ml-2">
            ✕
          </button>
        </div>
      )}

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

      {/* Reorder Threshold Alert Banner */}
      {enableSafetyReorder && skusNeedingReorder.length > 0 && (
        <div className="bg-gradient-to-r from-amber-50 via-orange-50 to-white border border-amber-300 rounded-2xl p-5 shadow-sm space-y-3">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-amber-200 pb-3">
            <div className="flex items-center space-x-3">
              <div className="p-2.5 bg-amber-100 text-amber-800 border border-amber-300 rounded-xl">
                <TrendingDown className="w-6 h-6 animate-pulse" />
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-200 text-amber-900 border border-amber-300">
                    REORDER THRESHOLD ALERT
                  </span>
                  <span className="text-xs text-amber-800 font-mono font-semibold">
                    {skusNeedingReorder.length} SKU(s) Low Stock
                  </span>
                </div>
                <h3 className="text-base font-bold text-slate-900 mt-0.5">
                  Stock has reached or dropped below safety reorder levels
                </h3>
              </div>
            </div>

            <button
              onClick={() => {
                setActiveViewMode('skus');
                setSelectedStatusFilter('REORDER_NEEDED');
              }}
              className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-white font-bold text-xs rounded-xl shadow-sm transition-all cursor-pointer flex items-center space-x-1.5 self-start md:self-auto"
            >
              <ShoppingCart className="w-4 h-4" />
              <span>Review Low Stock SKUs ({skusNeedingReorder.length})</span>
            </button>
          </div>

          {/* Quick list of low stock SKUs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {skusNeedingReorder.map((sku) => {
              const currentStock = skuStockMap.get(sku.sku)?.totalOnHand || 0;
              return (
                <div
                  key={sku.sku}
                  className="bg-white border border-amber-300 p-3 rounded-xl flex items-center justify-between gap-2 shadow-xs"
                >
                  <div className="min-w-0">
                    <div className="font-bold text-slate-900 text-xs truncate">{sku.name}</div>
                    <div className="text-[11px] font-mono text-slate-600 mt-0.5">
                      Stock: <span className="text-amber-700 font-bold">{currentStock}</span> / Min:{' '}
                      <span className="text-slate-800">{sku.reorderPoint} {sku.unit}</span>
                    </div>
                  </div>

                  <button
                    onClick={() => handleOpenPoModal(sku)}
                    className="px-2.5 py-1.5 bg-purple-600 hover:bg-purple-500 text-white font-bold text-[11px] rounded-lg shadow-xs flex items-center space-x-1 cursor-pointer flex-shrink-0"
                  >
                    <ShoppingCart className="w-3 h-3" />
                    <span>Generate PO</span>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* KPI Cards Header */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total On-Hand Stock</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{totalStockUnits.toLocaleString()} <span className="text-xs text-slate-500 font-normal">units</span></p>
            <p className="text-xs text-emerald-600 mt-1 flex items-center font-medium">
              <TrendingUp className="w-3 h-3 mr-1" /> Across {batches.length} active lots
            </p>
          </div>
          <div className="bg-blue-50 p-3 rounded-xl border border-blue-200">
            <Boxes className="w-6 h-6 text-blue-600" />
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Reorder Threshold Alerts</p>
            <p className={`text-2xl font-bold mt-1 ${skusNeedingReorder.length > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
              {skusNeedingReorder.length} <span className="text-xs text-slate-500 font-normal">SKUs</span>
            </p>
            <p className="text-xs text-amber-700 mt-1 font-medium">Requires Purchase Orders</p>
          </div>
          <div className="bg-amber-50 p-3 rounded-xl border border-amber-200">
            <ShoppingCart className="w-6 h-6 text-amber-600" />
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Quarantined / Hold Lots</p>
            <p className="text-2xl font-bold text-rose-600 mt-1">{quarantinedCount} <span className="text-xs text-slate-500 font-normal">lots</span></p>
            <p className="text-xs text-rose-700 mt-1 font-medium">Stock locked from picking</p>
          </div>
          <div className="bg-rose-50 p-3 rounded-xl border border-rose-200">
            <ShieldAlert className="w-6 h-6 text-rose-600" />
          </div>
        </div>

        <div
          onClick={() => setActiveViewMode('facilities')}
          className="bg-white border border-slate-200 hover:border-teal-400 rounded-xl p-4 shadow-xs flex items-center justify-between cursor-pointer transition-all hover:shadow-md group"
          title="Click to view Facilities & Zones"
        >
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider group-hover:text-teal-700">Facilities & Zones</p>
            <p className="text-2xl font-bold text-teal-600 mt-1">{locations.length} <span className="text-xs text-slate-500 font-normal">Putaway Bins</span></p>
            <p className="text-xs text-teal-700 mt-1 font-medium flex items-center gap-1">
              <span>Aisles A, B, C, D</span>
              <span className="text-[10px] bg-teal-100 text-teal-800 px-1.5 py-0.5 rounded font-mono font-bold">Manage</span>
            </p>
          </div>
          <div className="bg-teal-50 p-3 rounded-xl border border-teal-200 group-hover:bg-teal-100 transition-colors">
            <Building2 className="w-6 h-6 text-teal-600" />
          </div>
        </div>

      </div>

      {/* Main Action Bar & View Switcher - 3 Row Layout */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-4 md:p-5 shadow-xs space-y-3.5">
        
        {/* Row 1: View Navigation Tabs */}
        <div className="border-b border-slate-200/80 pb-3">
          <div className="bg-slate-100/90 p-1.5 rounded-2xl border border-slate-200/80 flex flex-wrap items-center gap-1.5 shadow-inner w-full">
            <button
              onClick={() => setActiveViewMode('dashboard')}
              className={`flex items-center space-x-1.5 px-2.5 xl:px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex-1 sm:flex-initial justify-center whitespace-nowrap ${
                activeViewMode === 'dashboard'
                  ? 'bg-slate-900 text-white shadow-sm ring-1 ring-slate-900'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/80'
              }`}
            >
              <TrendingUp className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Operations Dashboard</span>
            </button>

            <button
              onClick={() => setActiveViewMode('batches')}
              className={`flex items-center space-x-1.5 px-2.5 xl:px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex-1 sm:flex-initial justify-center whitespace-nowrap ${
                activeViewMode === 'batches'
                  ? 'bg-blue-600 text-white shadow-sm ring-1 ring-blue-600'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/80'
              }`}
            >
              <Boxes className="w-4 h-4 shrink-0" />
              <span>Inventory Lots & BBD</span>
            </button>

            <button
              onClick={() => setActiveViewMode('skus')}
              className={`flex items-center space-x-1.5 px-2.5 xl:px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex-1 sm:flex-initial justify-center whitespace-nowrap ${
                activeViewMode === 'skus'
                  ? 'bg-purple-600 text-white shadow-sm ring-1 ring-purple-600'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/80'
              }`}
            >
              <Layers className="w-4 h-4 shrink-0" />
              <span>SKU Catalog & Reorders</span>
              {skusNeedingReorder.length > 0 && (
                <span className="px-1.5 py-0.5 rounded-full bg-amber-500 text-white text-[10px] font-black shadow-xs">
                  {skusNeedingReorder.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveViewMode('facilities')}
              className={`flex items-center space-x-1.5 px-2.5 xl:px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex-1 sm:flex-initial justify-center whitespace-nowrap ${
                activeViewMode === 'facilities'
                  ? 'bg-teal-600 text-white shadow-sm ring-1 ring-teal-600'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/80'
              }`}
            >
              <Building2 className="w-4 h-4 text-teal-300 shrink-0" />
              <span>Facilities & Zones</span>
            </button>

            <button
              onClick={() => setActiveViewMode('sheetMatrix')}
              className={`flex items-center space-x-1.5 px-2.5 xl:px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex-1 sm:flex-initial justify-center whitespace-nowrap ${
                activeViewMode === 'sheetMatrix'
                  ? 'bg-amber-600 text-white shadow-sm ring-1 ring-amber-600'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/80'
              }`}
            >
              <FileText className="w-4 h-4 shrink-0" />
              <span>Balance Matrix</span>
            </button>

            <button
              onClick={() => setActiveViewMode('purchaseOrders')}
              className={`flex items-center space-x-1.5 px-2.5 xl:px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex-1 sm:flex-initial justify-center whitespace-nowrap ${
                activeViewMode === 'purchaseOrders'
                  ? 'bg-emerald-600 text-white shadow-sm ring-1 ring-emerald-600'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/80'
              }`}
            >
              <FileText className="w-4 h-4 shrink-0" />
              <span>Purchase Orders</span>
              {purchaseOrders.length > 0 && (
                <span className="px-1.5 py-0.5 rounded-full bg-emerald-600 text-white text-[10px] font-black shadow-xs">
                  {purchaseOrders.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveViewMode('reports')}
              className={`flex items-center space-x-1.5 px-2.5 xl:px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex-1 sm:flex-initial justify-center whitespace-nowrap ${
                activeViewMode === 'reports'
                  ? 'bg-amber-600 text-white shadow-sm ring-1 ring-amber-600'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/80'
              }`}
            >
              <BarChart3 className="w-4 h-4 shrink-0" />
              <span>Reports & Analytics</span>
            </button>
          </div>
        </div>

        {/* Row 2: Action Buttons */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between border-b border-slate-200/80 pb-3 gap-2.5">
          {/* Secondary Action Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setShowCsvImportModal(true)}
              className="flex items-center space-x-2 px-3.5 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200/80 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-2xs hover:shadow-xs"
              title="Bulk import SKUs or Lot Batches via CSV and download sample CSV templates"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
              <span>CSV Import</span>
            </button>

            <button
              onClick={() => handleOpenStockTakeModal()}
              className="flex items-center space-x-2 px-3.5 py-2 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200/80 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-2xs hover:shadow-xs"
            >
              <Sliders className="w-4 h-4 text-amber-600" />
              <span>Stock Take</span>
            </button>

            <button
              onClick={() => setShowMovementLogDrawer(!showMovementLogDrawer)}
              className="flex items-center space-x-2 px-3.5 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 rounded-xl text-xs font-bold border border-slate-200 transition-all cursor-pointer"
            >
              <History className="w-4 h-4 text-slate-600" />
              <span>Stock Log Stream</span>
            </button>
          </div>

          {/* Primary CTA Buttons */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              onClick={handleOpenInbound}
              className="flex items-center justify-center space-x-2 px-4 py-2.5 bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 hover:from-blue-700 hover:to-indigo-800 text-white rounded-xl text-xs font-extrabold shadow-md hover:shadow-lg ring-2 ring-blue-500/20 hover:ring-blue-500/40 transition-all cursor-pointer transform hover:-translate-y-0.5 active:translate-y-0"
            >
              <PlusCircle className="w-4 h-4 text-blue-200 animate-pulse" />
              <span className="tracking-wide">Inbound Stock Receive</span>
            </button>

            <button
              onClick={() => handleOpenOutboundModal()}
              className="flex items-center justify-center space-x-2 px-4 py-2.5 bg-gradient-to-r from-rose-600 via-rose-700 to-rose-800 hover:from-rose-700 hover:to-rose-900 text-white rounded-xl text-xs font-extrabold shadow-md hover:shadow-lg ring-2 ring-rose-500/20 hover:ring-rose-500/40 transition-all cursor-pointer transform hover:-translate-y-0.5 active:translate-y-0"
              title="Deduct loose stock deliver with remark & purpose or link to Sales Order update"
            >
              <PackageMinus className="w-4 h-4 text-rose-200" />
              <span className="tracking-wide">Outbound Stock Deliver</span>
            </button>
          </div>
        </div>

        {/* Row 3: Filter & Search Bar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pt-0.5">
          
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search SKU, Item Name, Batch No, Bin Location, or Barcode..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-300/80 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 transition-all"
            />
          </div>

          {/* Filter dropdowns */}
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={selectedCategoryFilter}
              onChange={(e) => setSelectedCategoryFilter(e.target.value)}
              className="bg-slate-50 border border-slate-300/80 text-xs font-semibold text-slate-800 rounded-xl px-3.5 py-2.5 focus:outline-none focus:bg-white focus:border-purple-500 focus:ring-2 focus:ring-purple-500/10 cursor-pointer transition-all"
            >
              <option value="ALL">All Categories</option>
              {categoriesList.map((cat) => (
                <option key={cat} value={cat}>
                  📁 {cat}
                </option>
              ))}
            </select>

            <select
              value={selectedStatusFilter}
              onChange={(e) => setSelectedStatusFilter(e.target.value)}
              className="bg-slate-50 border border-slate-300/80 text-xs font-semibold text-slate-800 rounded-xl px-3.5 py-2.5 focus:outline-none focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 cursor-pointer transition-all"
            >
              <option value="ALL">All Statuses</option>
              <option value="REORDER_NEEDED">⚠️ Low Stock / Reorder Needed</option>
              <option value="CRITICAL">⚡ Critical (&lt;14 Days Expiry)</option>
              <option value="EXPIRING_SOON">⚠️ Expiring Soon (&lt;30 Days)</option>
              <option value="QUARANTINED">🔒 Quarantined / Lock</option>
              <option value="HEALTHY">✅ Healthy / Sufficient Stock</option>
            </select>

            <select
              value={selectedZoneFilter}
              onChange={(e) => setSelectedZoneFilter(e.target.value)}
              className="bg-slate-50 border border-slate-300/80 text-xs font-semibold text-slate-800 rounded-xl px-3.5 py-2.5 focus:outline-none focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 cursor-pointer transition-all"
            >
              <option value="ALL">All Storage Zones</option>
              {(zones && zones.length > 0 ? zones : INITIAL_ZONES).map((z) => (
                <option key={z.code} value={z.code}>
                  {z.icon ? `${z.icon} ` : ''}{z.title || z.code}
                </option>
              ))}
            </select>

            <button
              onClick={handleRefreshData}
              disabled={isRefreshing}
              className="p-2.5 bg-slate-100 hover:bg-slate-200/80 text-slate-700 rounded-xl transition-all border border-slate-300/80 hover:border-slate-400 cursor-pointer active:scale-95 disabled:opacity-50"
              title="Refresh Inventory Data"
            >
              <RefreshCw className={`w-4 h-4 text-slate-600 ${isRefreshing ? 'animate-spin text-blue-600' : ''}`} />
            </button>
          </div>

        </div>
      </div>

      {/* VIEW MODE 0: REAL-TIME OPERATIONS DASHBOARD */}
      {activeViewMode === 'dashboard' && (
        <RealtimeDashboard
          skus={skus}
          batches={batches}
          locations={locations}
          zones={zones}
          stockMovements={stockMovements}
          currentUser={currentUser}
          onRefresh={onRefresh}
          onLogAuditActivity={onLogAuditActivity}
          onOpenInboundModal={handleOpenInbound}
          enableSafetyReorder={enableSafetyReorder}
          onToggleSafetyReorder={onToggleSafetyReorder}
          onNavigateToFacilityLayout={() => setActiveViewMode('facilities')}
        />
      )}

      {/* VIEW MODE 1: BATCH LOT MATRIX */}
      {activeViewMode === 'batches' && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
            <div>
              <h3 className="font-bold text-slate-900 text-base flex items-center space-x-2">
                <Boxes className="w-5 h-5 text-blue-600" />
                <span>Inventory Lots & Best Before Date (BBD) Matrix</span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Real-time batch level tracking with automatic FEFO expiration & SKU reorder point highlighting.
              </p>
            </div>
            <span className="text-xs font-mono text-slate-600 bg-slate-100 px-2.5 py-1 rounded-md border border-slate-200 font-semibold">
              Showing {filteredBatches.length} of {batches.length} lots
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-700">
              <thead className="bg-slate-100 text-slate-700 uppercase text-xs tracking-wider border-b border-slate-200 font-mono font-bold">
                <tr>
                  <th className="py-3 px-4">SKU & Item Name</th>
                  <th className="py-3 px-4">Batch / Lot No</th>
                  <th className="py-3 px-4">Best Before Date (BBD)</th>
                  <th className="py-3 px-4">Bin Location</th>
                  <th className="py-3 px-4">On-Hand / Available</th>
                  <th className="py-3 px-4">Reorder Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredBatches.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-12 text-slate-400">
                      No matching inventory lots found. Try adjusting your search query or filters.
                    </td>
                  </tr>
                ) : (
                  filteredBatches.map((batch) => {
                    const skuObj = skus.find((s) => s.sku === batch.sku);
                    const totalSkuStock = skuStockMap.get(batch.sku)?.totalOnHand || 0;
                    const isReorderNeeded = skuObj ? totalSkuStock <= skuObj.reorderPoint : false;

                    return (
                      <tr
                        key={batch.id}
                        className={`hover:bg-slate-50 transition-colors ${
                          batch.status === 'QUARANTINED' ? 'bg-rose-50/50' : isReorderNeeded ? 'bg-amber-50/40' : ''
                        }`}
                      >
                        {/* SKU & Name */}
                        <td className="py-3.5 px-4">
                          <div className="font-semibold text-slate-900">{batch.itemName}</div>
                          <div className="text-xs text-slate-500 font-mono flex items-center space-x-2 mt-0.5">
                            <span className="font-bold text-slate-700">{batch.sku}</span>
                            <span className="text-slate-300">•</span>
                            <span className="text-slate-500 flex items-center">
                              <Barcode className="w-3 h-3 mr-1 text-slate-400" />
                              {skuObj?.barcode}
                            </span>
                          </div>
                        </td>

                        {/* Batch No */}
                        <td className="py-3.5 px-4 font-mono font-bold text-blue-700">
                          {batch.batchNo}
                          {batch.status === 'QUARANTINED' && (
                            <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-xs font-sans font-bold bg-rose-100 text-rose-800 border border-rose-300">
                              QUARANTINED
                            </span>
                          )}
                        </td>

                        {/* Best Before Date & FEFO Badge */}
                        <td className="py-3.5 px-4">
                          <div className="flex items-center space-x-2">
                            <Calendar className="w-3.5 h-3.5 text-slate-400" />
                            <span className="font-mono text-slate-900 font-medium">{batch.bestBeforeDate}</span>
                          </div>
                          <div className="mt-1">
                            {batch.expiryAlert === 'EXPIRED' && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-rose-100 text-rose-800 border border-rose-300">
                                🚨 EXPIRED ({Math.abs(batch.daysUntilExpiry)} days ago)
                              </span>
                            )}
                            {batch.expiryAlert === 'CRITICAL' && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-300">
                                ⚡ CRITICAL FEFO ({batch.daysUntilExpiry} days left)
                              </span>
                            )}
                            {batch.expiryAlert === 'EXPIRING_SOON' && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-yellow-100 text-yellow-800 border border-yellow-300">
                                ⚠️ Expiring Soon ({batch.daysUntilExpiry} days)
                              </span>
                            )}
                            {batch.expiryAlert === 'HEALTHY' && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300">
                                ✅ Fresh ({batch.daysUntilExpiry} days left)
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Bin Location */}
                        <td className="py-3.5 px-4">
                          <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-mono font-bold bg-slate-100 text-blue-700 border border-slate-200">
                            <MapPin className="w-3 h-3 mr-1 text-blue-600" />
                            {batch.locationId}
                          </span>
                          {batch.locationDetails && (
                            <span className="text-xs text-slate-500 block mt-0.5">
                              Zone: {batch.locationDetails.zone}
                            </span>
                          )}
                        </td>

                        {/* Quantities */}
                        <td className="py-3.5 px-4 font-mono">
                          <div className={`font-bold ${batch.quantityOnHand < 0 ? 'text-rose-600 bg-rose-50 px-1 rounded inline-block' : 'text-slate-900'}`}>{batch.quantityOnHand} {skuObj?.unit || 'units'}</div>
                          <div className="text-xs text-slate-500">
                            Avail: <span className={batch.quantityAvailable < 0 ? 'text-rose-600 font-extrabold bg-rose-50 px-1 rounded' : 'text-emerald-700 font-semibold'}>{batch.quantityAvailable}</span>
                          </div>
                        </td>

                        {/* SKU Reorder Status Indicator */}
                        <td className="py-3.5 px-4 font-mono text-xs">
                          {isReorderNeeded ? (
                            <div className="space-y-1">
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-amber-100 text-amber-900 border border-amber-300 animate-pulse">
                                ⚠️ REORDER POINT REACHED
                              </span>
                              <div className="text-[10px] text-amber-800 font-semibold">
                                Total: {totalSkuStock} / Min: {skuObj?.reorderPoint}
                              </div>
                            </div>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                              ✅ Stock OK ({totalSkuStock})
                            </span>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="py-3.5 px-4 text-right space-x-1.5">
                          <button
                            onClick={() => handleOpenOutboundModal(batch.sku, batch.batchNo)}
                            title="Perform loose stock out on this specific batch lot"
                            className="px-2.5 py-1 rounded text-xs font-semibold bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-300 transition-colors cursor-pointer inline-flex items-center space-x-1"
                          >
                            <PackageMinus className="w-3 h-3 text-rose-600" />
                            <span>Outbound</span>
                          </button>

                          <button
                            onClick={() => handleOpenStockTakeModal(batch.sku, batch.batchNo)}
                            title="Perform Stock Take Adjustment on this batch lot"
                            className="px-2.5 py-1 rounded text-xs font-semibold bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 transition-colors cursor-pointer inline-flex items-center space-x-1"
                          >
                            <Sliders className="w-3 h-3 text-amber-600" />
                            <span>Adjust</span>
                          </button>

                          {skuObj && isReorderNeeded && (
                            <button
                              onClick={() => handleOpenPoModal(skuObj)}
                              className="px-2.5 py-1 rounded text-xs font-bold bg-purple-600 hover:bg-purple-500 text-white shadow-xs transition-colors cursor-pointer inline-flex items-center space-x-1"
                            >
                              <ShoppingCart className="w-3 h-3" />
                              <span>PO</span>
                            </button>
                          )}

                          <button
                            onClick={() => handleToggleQuarantine(batch.batchNo)}
                            className={`px-2.5 py-1 rounded text-xs font-medium transition-colors cursor-pointer border ${
                              batch.status === 'QUARANTINED'
                                ? 'bg-emerald-100 text-emerald-800 border-emerald-300 hover:bg-emerald-200'
                                : 'bg-rose-100 text-rose-800 border-rose-300 hover:bg-rose-200'
                            }`}
                          >
                            {batch.status === 'QUARANTINED' ? 'Release' : 'Quarantine'}
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* VIEW MODE 2: SKU CATALOG & REORDER MONITOR */}
      {activeViewMode === 'skus' && (
        <div className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
            <div>
              <h3 className="font-bold text-slate-900 text-base flex items-center space-x-2">
                <Layers className="w-5 h-5 text-purple-600" />
                <span>SKU Reorder Point & Safety Stock Monitor</span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Aggregate inventory levels compared against minimum reorder thresholds. Register new SKUs or generate purchase orders instantly.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Display Type Selector */}
              <div className="flex items-center bg-slate-100 p-1 rounded-lg border border-slate-200">
                <button
                  type="button"
                  onClick={() => setSkuCatalogLayout('grid')}
                  className={`px-2.5 py-1 rounded-md text-xs font-bold transition-all flex items-center space-x-1 cursor-pointer ${
                    skuCatalogLayout === 'grid'
                      ? 'bg-white text-purple-700 shadow-xs border border-slate-200/80 font-extrabold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                  title="Grid Card View"
                >
                  <LayoutGrid className="w-3 h-3" />
                  <span>Grid Cards</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSkuCatalogLayout('table')}
                  className={`px-2.5 py-1 rounded-md text-xs font-bold transition-all flex items-center space-x-1 cursor-pointer ${
                    skuCatalogLayout === 'table'
                      ? 'bg-white text-purple-700 shadow-xs border border-slate-200/80 font-extrabold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                  title="Data Table View"
                >
                  <Table className="w-3 h-3" />
                  <span>Data Table</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSkuCatalogLayout('category')}
                  className={`px-2.5 py-1 rounded-md text-xs font-bold transition-all flex items-center space-x-1 cursor-pointer ${
                    skuCatalogLayout === 'category'
                      ? 'bg-white text-purple-700 shadow-xs border border-slate-200/80 font-extrabold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                  title="Grouped by Category View"
                >
                  <FolderTree className="w-3 h-3" />
                  <span>By Category</span>
                </button>
              </div>

              <span className="text-xs font-mono text-slate-600 bg-slate-100 px-2.5 py-1.5 rounded-md border border-slate-200 font-semibold hidden lg:inline-block">
                {filteredSkus.length} Items
              </span>
              <button
                onClick={() => handleOpenRenameCategoryModal()}
                title="Manage, rename, or delete categories globally"
                className="flex items-center space-x-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-lg text-xs font-bold transition-all cursor-pointer shadow-xs"
              >
                <FolderEdit className="w-4 h-4 text-purple-600" />
                <span>Manage Categories</span>
              </button>
              <button
                onClick={() => setShowCreateSkuModal(true)}
                className="flex items-center space-x-1.5 px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-xs font-bold transition-all cursor-pointer shadow-xs"
              >
                <PackagePlus className="w-4 h-4" />
                <span>+ Create New SKU</span>
              </button>
            </div>
          </div>

          {filteredSkus.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-12 text-center text-slate-400">
              No matching SKUs found for your filter criteria.
            </div>
          ) : skuCatalogLayout === 'grid' ? (
            /* DISPLAY TYPE 1: GRID CARDS */
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredSkus.map((sku) => {
                const stock = skuStockMap.get(sku.sku)?.totalOnHand || 0;
                const isReorderNeeded = stock <= sku.reorderPoint;
                const percentOfReorder = Math.min(100, Math.round((stock / (sku.reorderPoint * 2)) * 100));

                return (
                  <div
                    key={sku.sku}
                    className={`bg-white border rounded-2xl p-5 space-y-4 shadow-xs flex flex-col justify-between transition-all ${
                      isReorderNeeded
                        ? 'border-amber-400 bg-amber-50/20 shadow-amber-500/5'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div>
                      {/* SKU Header & Status */}
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center space-x-2">
                            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-100 text-slate-700 border border-slate-200">
                              {sku.sku}
                            </span>
                            <button
                              onClick={() => handleOpenEditSkuModal(sku)}
                              title="Edit SKU & Category"
                              className="inline-flex items-center space-x-1 px-1.5 py-0.5 text-[10px] font-semibold text-purple-700 bg-purple-50 border border-purple-200/80 rounded hover:bg-purple-100 transition-colors cursor-pointer"
                            >
                              <Tag className="w-2.5 h-2.5 text-purple-600" />
                              <span>{sku.category}</span>
                              <Edit3 className="w-2.5 h-2.5 text-purple-500 ml-0.5" />
                            </button>
                          </div>
                          <h4 className="font-bold text-slate-900 text-base mt-1.5">{sku.name}</h4>
                        </div>

                        {isReorderNeeded ? (
                          <span className="px-2.5 py-1 rounded-lg text-xs font-mono font-bold bg-amber-100 text-amber-900 border border-amber-300 flex items-center space-x-1 animate-pulse shrink-0">
                            <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                            <span>LOW STOCK</span>
                          </span>
                        ) : (
                          <span className="px-2.5 py-1 rounded-lg text-xs font-mono font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200 shrink-0">
                            HEALTHY
                          </span>
                        )}
                      </div>

                      {/* Description */}
                      <p className="text-xs text-slate-600 mt-2 line-clamp-2 leading-relaxed">
                        {sku.description}
                      </p>

                      {/* Stock Level Progress Bar vs Reorder Point */}
                      <div className="mt-4 p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                        <div className="flex items-center justify-between text-xs font-mono">
                          <span className="text-slate-500">Total Stock On-Hand:</span>
                          <span className={`font-bold ${isReorderNeeded ? 'text-amber-700' : 'text-slate-900'}`}>
                            {stock} {sku.unit}
                          </span>
                        </div>

                        {/* Bar */}
                        <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                          <div
                            className={`h-full transition-all duration-500 rounded-full ${
                              isReorderNeeded ? 'bg-amber-500' : 'bg-emerald-500'
                            }`}
                            style={{ width: `${percentOfReorder}%` }}
                          />
                        </div>

                        <div className="flex items-center justify-between text-[11px] font-mono text-slate-600 pt-1">
                          <span>Reorder Point: <strong className="text-amber-700">{sku.reorderPoint}</strong></span>
                          <span>Safety Stock: <strong className="text-slate-800">{sku.safetyStock}</strong></span>
                        </div>
                      </div>
                    </div>

                    {/* Bottom Actions */}
                    <div className="pt-3 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2">
                      <div className="text-[11px] font-mono text-slate-500">
                        Zone: <span className="text-slate-800 font-bold">{sku.storageZone}</span>
                      </div>

                      <div className="flex items-center space-x-1.5">
                        <button
                          onClick={() => handleOpenStockTakeModal(sku.sku)}
                          title="Perform Stock Take / Physical Inventory Adjustment"
                          className="px-2.5 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 rounded-lg text-xs font-semibold flex items-center space-x-1 transition-all cursor-pointer border border-amber-300"
                        >
                          <Sliders className="w-3 h-3 text-amber-600" />
                          <span>Adjust Stock</span>
                        </button>

                        <button
                          onClick={() => handleOpenEditSkuModal(sku)}
                          className="px-2.5 py-1.5 bg-slate-100 hover:bg-purple-50 hover:text-purple-700 hover:border-purple-300 text-slate-700 rounded-lg text-xs font-semibold flex items-center space-x-1 transition-all cursor-pointer border border-slate-200"
                        >
                          <Edit3 className="w-3 h-3 text-slate-500" />
                          <span>Edit SKU / Category</span>
                        </button>

                        <button
                          onClick={() => handleOpenPoModal(sku)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center space-x-1 cursor-pointer shadow-xs ${
                            isReorderNeeded
                              ? 'bg-amber-500 hover:bg-amber-400 text-white font-black'
                              : 'bg-purple-600 hover:bg-purple-500 text-white'
                          }`}
                        >
                          <ShoppingCart className="w-3.5 h-3.5" />
                          <span>Order PO</span>
                        </button>
                      </div>
                    </div>

                  </div>
                );
              })}
            </div>
          ) : skuCatalogLayout === 'table' ? (
            /* DISPLAY TYPE 2: DATA TABLE SPREADSHEET VIEW */
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-700 font-bold uppercase tracking-wider text-[11px]">
                    <tr>
                      <th className="p-3.5">SKU Code</th>
                      <th className="p-3.5">Product Item Name</th>
                      <th className="p-3.5">Category</th>
                      <th className="p-3.5">Storage Zone</th>
                      <th className="p-3.5 text-right">Stock On-Hand</th>
                      <th className="p-3.5 text-right">Reorder Pt</th>
                      <th className="p-3.5 text-right">Safety Stock</th>
                      <th className="p-3.5 text-center">Status</th>
                      <th className="p-3.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-sans">
                    {filteredSkus.map((sku) => {
                      const stock = skuStockMap.get(sku.sku)?.totalOnHand || 0;
                      const isReorderNeeded = stock <= sku.reorderPoint;
                      return (
                        <tr key={sku.sku} className="hover:bg-purple-50/20 transition-colors">
                          <td className="p-3.5 font-mono font-extrabold text-slate-900">{sku.sku}</td>
                          <td className="p-3.5 font-bold text-slate-900">
                            <div>{sku.name}</div>
                            {sku.description && (
                              <div className="text-[11px] text-slate-500 font-normal line-clamp-1">{sku.description}</div>
                            )}
                          </td>
                          <td className="p-3.5">
                            <span className="px-2.5 py-1 rounded-md text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200/80 inline-flex items-center space-x-1">
                              <Tag className="w-2.5 h-2.5 text-purple-600" />
                              <span>{sku.category}</span>
                            </span>
                          </td>
                          <td className="p-3.5 font-mono text-slate-600 font-semibold">{sku.storageZone}</td>
                          <td className={`p-3.5 text-right font-mono font-extrabold text-sm ${isReorderNeeded ? 'text-amber-700' : 'text-slate-900'}`}>
                            {stock} <span className="text-xs font-normal text-slate-500">{sku.unit}</span>
                          </td>
                          <td className="p-3.5 text-right font-mono text-slate-600 font-semibold">{sku.reorderPoint}</td>
                          <td className="p-3.5 text-right font-mono text-slate-600">{sku.safetyStock}</td>
                          <td className="p-3.5 text-center">
                            {isReorderNeeded ? (
                              <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase bg-amber-100 text-amber-900 border border-amber-300">
                                LOW STOCK
                              </span>
                            ) : (
                              <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase bg-emerald-100 text-emerald-800 border border-emerald-200">
                                HEALTHY
                              </span>
                            )}
                          </td>
                          <td className="p-3.5 text-right">
                            <div className="flex items-center justify-end space-x-1.5">
                              <button
                                onClick={() => handleOpenStockTakeModal(sku.sku)}
                                className="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 rounded-lg text-xs font-bold transition-all cursor-pointer"
                                title="Adjust Stock"
                              >
                                Adjust
                              </button>
                              <button
                                onClick={() => handleOpenEditSkuModal(sku)}
                                className="px-2.5 py-1 bg-slate-100 hover:bg-purple-50 text-slate-700 rounded-lg text-xs font-bold border border-slate-200 transition-all cursor-pointer"
                                title="Edit SKU / Category"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => handleOpenPoModal(sku)}
                                className="px-2.5 py-1 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-xs font-bold shadow-2xs transition-all cursor-pointer"
                                title="Create Purchase Order"
                              >
                                Order PO
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            /* DISPLAY TYPE 3: GROUPED BY CATEGORY VIEW */
            <div className="space-y-6">
              {Array.from(new Set(filteredSkus.map((s) => s.category))).map((catName) => {
                const categorySkus = filteredSkus.filter((s) => s.category === catName);
                const totalCatStock = categorySkus.reduce(
                  (acc, s) => acc + (skuStockMap.get(s.sku)?.totalOnHand || 0),
                  0
                );
                const lowStockCount = categorySkus.filter(
                  (s) => (skuStockMap.get(s.sku)?.totalOnHand || 0) <= s.reorderPoint
                ).length;

                return (
                  <div key={catName} className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
                    {/* Category Header Bar */}
                    <div className="p-4 bg-gradient-to-r from-purple-50/80 via-slate-50 to-white border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center space-x-3">
                        <div className="p-2 bg-purple-600 text-white rounded-xl shadow-xs">
                          <FolderTree className="w-4 h-4" />
                        </div>
                        <div>
                          <h4 className="font-extrabold text-slate-900 text-sm flex items-center space-x-2">
                            <span>{catName}</span>
                            <span className="text-xs text-purple-700 bg-purple-100 border border-purple-200/80 px-2 py-0.5 rounded-full font-bold">
                              {categorySkus.length} SKUs
                            </span>
                          </h4>
                          <p className="text-[11px] text-slate-500 mt-0.5">
                            Combined Category Stock: <strong className="text-slate-800">{totalCatStock} CTN</strong>
                          </p>
                        </div>
                      </div>

                      {lowStockCount > 0 && (
                        <span className="px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-900 border border-amber-300 flex items-center space-x-1.5 self-start sm:self-auto">
                          <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                          <span>{lowStockCount} Low Stock Item(s) Need Reorder</span>
                        </span>
                      )}
                    </div>

                    {/* Category Items List */}
                    <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {categorySkus.map((sku) => {
                        const stock = skuStockMap.get(sku.sku)?.totalOnHand || 0;
                        const isReorderNeeded = stock <= sku.reorderPoint;
                        return (
                          <div
                            key={sku.sku}
                            className={`p-3.5 rounded-xl border transition-all flex flex-col justify-between space-y-3 ${
                              isReorderNeeded
                                ? 'bg-amber-50/30 border-amber-300'
                                : 'bg-slate-50/50 border-slate-200/80 hover:bg-white'
                            }`}
                          >
                            <div>
                              <div className="flex items-center justify-between gap-2">
                                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-100 text-slate-800 border border-slate-200">
                                  {sku.sku}
                                </span>
                                {isReorderNeeded ? (
                                  <span className="px-2 py-0.5 rounded text-[10px] font-black bg-amber-100 text-amber-900 border border-amber-300">
                                    LOW STOCK
                                  </span>
                                ) : (
                                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                    HEALTHY
                                  </span>
                                )}
                              </div>
                              <h5 className="font-bold text-slate-900 text-sm mt-1.5">{sku.name}</h5>
                              <div className="mt-2 flex items-center justify-between text-xs font-mono text-slate-600">
                                <span>Stock: <strong className={isReorderNeeded ? 'text-amber-700' : 'text-slate-900'}>{stock} {sku.unit}</strong></span>
                                <span>Min Reorder: <strong>{sku.reorderPoint}</strong></span>
                              </div>
                            </div>

                            <div className="pt-2 border-t border-slate-200/80 flex items-center justify-between gap-1">
                              <span className="text-[10px] font-mono text-slate-500">Zone: {sku.storageZone}</span>
                              <div className="flex items-center space-x-1">
                                <button
                                  onClick={() => handleOpenStockTakeModal(sku.sku)}
                                  className="px-2 py-0.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 rounded text-[10px] font-bold"
                                >
                                  Adjust
                                </button>
                                <button
                                  onClick={() => handleOpenEditSkuModal(sku)}
                                  className="px-2 py-0.5 bg-slate-100 text-slate-700 border border-slate-200 rounded text-[10px] font-bold"
                                >
                                  Edit
                                </button>
                                <button
                                  onClick={() => handleOpenPoModal(sku)}
                                  className="px-2 py-0.5 bg-purple-600 text-white rounded text-[10px] font-bold"
                                >
                                  PO
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* VIEW MODE 3: CATCHER GOURMET SHEET BALANCE MATRIX */}
      {activeViewMode === 'sheetMatrix' && (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden space-y-4">
          {/* Header Bar */}
          <div className="p-5 border-b border-slate-200 bg-gradient-to-r from-amber-500/10 via-orange-500/5 to-slate-50 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center space-x-2.5">
                <div className="p-2 bg-amber-600 text-white rounded-xl shadow-xs">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-lg tracking-tight">
                    Catcher Gourmet Internal Sheet Balance Matrix
                  </h3>
                  <p className="text-xs text-slate-600 mt-0.5">
                    Official internal balance sheet tracking: Monthly stock balances (JAN - DEC) with custom month filtering & date choose controls.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleSyncMatrixWithDatabase}
                disabled={isSyncingMatrix}
                className="flex items-center space-x-1.5 px-3.5 py-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer"
                title="Recalculate and synchronize Catcher Gourmet Matrix with live database batches and stock movements"
              >
                <RefreshCw className={`w-4 h-4 ${isSyncingMatrix ? 'animate-spin' : ''}`} />
                <span>{isSyncingMatrix ? 'Syncing...' : 'Sync Matrix with Database'}</span>
              </button>

              <button
                onClick={handleExportMatrixCsv}
                className="flex items-center space-x-1.5 px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer"
                title="Download CSV for internal spreadsheet audit"
              >
                <Download className="w-4 h-4 text-amber-400" />
                <span>Export Internal Matrix CSV</span>
              </button>
            </div>
          </div>

          {/* Month Need & Date Choose Filter Bar */}
          <div className="p-4 bg-slate-50/80 border-b border-slate-200 space-y-3">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              {/* Filter Mode Toggle */}
              <div className="flex items-center space-x-1 bg-white p-1 rounded-xl border border-slate-300 shadow-2xs">
                <button
                  type="button"
                  onClick={() => setMatrixFilterMode('MONTH')}
                  className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                    matrixFilterMode === 'MONTH'
                      ? 'bg-amber-600 text-white shadow-xs'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  By Month Need
                </button>
                <button
                  type="button"
                  onClick={() => setMatrixFilterMode('CUSTOM_DATE')}
                  className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                    matrixFilterMode === 'CUSTOM_DATE'
                      ? 'bg-amber-600 text-white shadow-xs'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  Date Choose Option
                </button>
              </div>

              {/* Category & Search Inputs */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    placeholder="Search SKU Code / Description..."
                    value={matrixSearchQuery}
                    onChange={(e) => setMatrixSearchQuery(e.target.value)}
                    className="pl-9 pr-3 py-1.5 bg-white border border-slate-300 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-amber-500 w-48 sm:w-64"
                  />
                </div>

                <select
                  value={matrixCategoryFilter}
                  onChange={(e) => setMatrixCategoryFilter(e.target.value)}
                  className="px-3 py-1.5 bg-white border border-slate-300 rounded-xl text-xs text-slate-800 font-semibold focus:outline-none focus:border-amber-500"
                >
                  <option value="ALL">All Catcher Categories</option>
                  {categoriesList.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Sub-bar: Month Pills or Custom Date Picker */}
            {matrixFilterMode === 'MONTH' ? (
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                <span className="text-xs font-bold text-slate-600 mr-2 flex items-center space-x-1">
                  <Calendar className="w-3.5 h-3.5 text-amber-600" />
                  <span>Select Month Need:</span>
                </span>
                {['ALL', 'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'].map((m) => (
                  <button
                    key={m}
                    onClick={() => setMatrixSelectedMonth(m)}
                    className={`px-2.5 py-1 text-xs font-bold rounded-lg font-mono transition-all cursor-pointer ${
                      matrixSelectedMonth === m
                        ? 'bg-amber-700 text-white ring-2 ring-amber-400/50 shadow-xs'
                        : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-3 pt-1 bg-white p-2.5 rounded-xl border border-amber-200">
                <span className="text-xs font-bold text-slate-700 flex items-center space-x-1">
                  <Calendar className="w-4 h-4 text-amber-600" />
                  <span>Custom Date Range Option:</span>
                </span>
                <div className="flex items-center space-x-2">
                  <label className="text-xs text-slate-500 font-medium">From:</label>
                  <input
                    type="date"
                    value={matrixStartDate}
                    onChange={(e) => setMatrixStartDate(e.target.value)}
                    className="bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1 text-xs font-mono text-slate-800 focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div className="flex items-center space-x-2">
                  <label className="text-xs text-slate-500 font-medium">To:</label>
                  <input
                    type="date"
                    value={matrixEndDate}
                    onChange={(e) => setMatrixEndDate(e.target.value)}
                    className="bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1 text-xs font-mono text-slate-800 focus:outline-none focus:border-amber-500"
                  />
                </div>
                <span className="text-[11px] text-amber-800 font-semibold bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                  Filtering inventory movements & month balances between chosen dates
                </span>
              </div>
            )}
          </div>

          {/* KPI Summary Strip for Selected Month/Date Range */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 px-4">
            <div className="p-3 bg-amber-50/80 border border-amber-200 rounded-xl space-y-0.5">
              <span className="text-[10px] font-bold uppercase text-amber-800 tracking-wider">Active Period / Month</span>
              <div className="text-sm font-black text-amber-950 font-mono">
                {matrixFilterMode === 'MONTH' ? (matrixSelectedMonth === 'ALL' ? 'Full Year (JAN-DEC)' : `Month: ${matrixSelectedMonth}`) : `${matrixStartDate} to ${matrixEndDate}`}
              </div>
              <p className="text-[10px] text-amber-700">{matrixKPIs.count} SKUs included</p>
            </div>

            <div className="p-3 bg-emerald-50/80 border border-emerald-200 rounded-xl space-y-0.5">
              <span className="text-[10px] font-bold uppercase text-emerald-800 tracking-wider">Period Stock In</span>
              <div className="text-sm font-black text-emerald-950 font-mono">
                +{matrixKPIs.totalInbound.toLocaleString()} units
              </div>
              <p className="text-[10px] text-emerald-700">Total Goods Received</p>
            </div>

            <div className="p-3 bg-rose-50/80 border border-rose-200 rounded-xl space-y-0.5">
              <span className="text-[10px] font-bold uppercase text-rose-800 tracking-wider">Period Stock Out</span>
              <div className="text-sm font-black text-rose-950 font-mono">
                -{matrixKPIs.totalOutbound.toLocaleString()} units
              </div>
              <p className="text-[10px] text-rose-700">Total Customer Dispatches</p>
            </div>

            <div className="p-3 bg-blue-50/80 border border-blue-200 rounded-xl space-y-0.5">
              <span className="text-[10px] font-bold uppercase text-blue-800 tracking-wider">Period Net Valuation</span>
              <div className="text-sm font-black text-blue-950 font-mono">
                ${matrixKPIs.totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <p className="text-[10px] text-blue-700">{matrixKPIs.totalExactQty.toLocaleString()} units net exact</p>
            </div>
          </div>

          {/* Matrix Table */}
          <div className="overflow-x-auto p-4">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-900 text-white uppercase text-[10px] font-mono font-bold tracking-wider">
                <tr>
                  <th className="p-2.5 border border-slate-700">SKU Code</th>
                  <th className="p-2.5 border border-slate-700">Item Description</th>
                  <th className="p-2.5 border border-slate-700">Category</th>
                  <th className="p-2.5 border border-slate-700 text-right bg-emerald-900/60">Stock In</th>
                  <th className="p-2.5 border border-slate-700 text-right bg-rose-900/60">Stock Out</th>
                  <th className="p-2.5 border border-slate-700 text-right bg-amber-900/60">Reserved</th>
                  <th className="p-2.5 border border-slate-700 text-right bg-blue-900/60">Exact Qty</th>
                  <th className="p-2.5 border border-slate-700 text-right bg-slate-800">Bal Forward</th>
                  {matrixFilterMode === 'CUSTOM_DATE' ? (
                    <th className="p-2.5 border border-amber-600 bg-amber-900 text-amber-200 text-center font-black whitespace-nowrap min-w-[160px]">
                      Date Range Balance ({matrixStartDate} to {matrixEndDate})
                    </th>
                  ) : (
                    matrixSelectedMonth !== 'ALL' && (
                      <th className="p-2.5 border border-amber-600 bg-amber-900 text-amber-200 text-center font-black min-w-[130px] whitespace-nowrap">
                        Focus Month ({matrixSelectedMonth})
                      </th>
                    )
                  )}
                  <th className="p-2.5 border border-slate-700 text-center font-bold min-w-[520px] whitespace-nowrap">
                    Monthly Balances Breakdown (JAN - DEC)
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 font-mono text-[11px]">
                {matrixRowsData.map((row, idx) => {
                  const { skuItem, stockIn, stockOut, reserved, exactQty, balForward, months, focusVal, hasMovementsInRange, movementCount } = row;

                  return (
                    <tr
                      key={skuItem.sku}
                      className={idx % 2 === 0 ? 'bg-white hover:bg-amber-50/20' : 'bg-slate-50/60 hover:bg-amber-50/30'}
                    >
                      <td className="p-2.5 border border-slate-200 font-bold text-blue-700 whitespace-nowrap">
                        {skuItem.sku}
                      </td>
                      <td className="p-2.5 border border-slate-200 font-sans font-semibold text-slate-900 min-w-[220px]">
                        {skuItem.name}
                      </td>
                      <td className="p-2.5 border border-slate-200 font-sans text-slate-600 whitespace-nowrap">
                        {skuItem.category}
                      </td>
                      <td className="p-2.5 border border-slate-200 text-right font-bold text-emerald-700 bg-emerald-50/30">
                        {stockIn}
                      </td>
                      <td className="p-2.5 border border-slate-200 text-right font-bold text-rose-700 bg-rose-50/30">
                        {stockOut}
                      </td>
                      <td className="p-2.5 border border-slate-200 text-right font-bold text-amber-700 bg-amber-50/30">
                        {reserved}
                      </td>
                      <td className={`p-2.5 border border-slate-200 text-right font-black ${exactQty < 0 ? 'text-rose-600 bg-rose-100/50' : 'text-blue-800 bg-blue-50/40'}`}>
                        {exactQty}
                      </td>
                      <td className="p-2.5 border border-slate-200 text-right font-bold text-slate-800 bg-slate-100/60">
                        {balForward}
                      </td>

                      {/* Selected Focus Month / Date Range Balance Column */}
                      {(matrixFilterMode === 'CUSTOM_DATE' || matrixSelectedMonth !== 'ALL') && (
                        <td className="p-2.5 border-2 border-amber-300 text-center font-black bg-amber-100/80 text-amber-950">
                          {focusVal !== undefined ? (
                            <div className="flex flex-col items-center justify-center space-y-0.5">
                              <span className="text-xs bg-amber-200/90 px-2 py-1 rounded-md border border-amber-400 font-mono">
                                {focusVal}
                              </span>
                              {matrixFilterMode === 'CUSTOM_DATE' && (
                                <span className="text-[9px] font-sans font-semibold text-amber-800">
                                  {hasMovementsInRange ? `${movementCount} logs` : 'Base bal'}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-400 font-normal italic">-</span>
                          )}
                        </td>
                      )}

                      <td className="p-2 border border-slate-200 min-w-[520px]">
                        <div className="grid grid-cols-12 gap-1 text-[10px] text-center min-w-[500px]">
                          {['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'].map((m) => {
                            const isSelected = matrixSelectedMonth === m;
                            return (
                              <div
                                key={m}
                                className={`p-1 rounded border transition-all ${
                                  isSelected
                                    ? 'bg-amber-100 border-amber-400 text-amber-950 font-black ring-1 ring-amber-400 shadow-2xs'
                                    : 'bg-slate-100 border-slate-200 text-slate-800'
                                }`}
                              >
                                <div className={`text-[8px] font-sans font-bold ${isSelected ? 'text-amber-800' : 'text-slate-500'}`}>
                                  {m}
                                </div>
                                <div className="font-mono text-[10px]">
                                  {months[m] !== undefined ? months[m] : '-'}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* VIEW MODE 4: PURCHASE ORDERS LOG */}
      {activeViewMode === 'purchaseOrders' && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden space-y-4">
          <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/50">
            <div>
              <h3 className="font-bold text-slate-900 text-base flex items-center space-x-2">
                <FileText className="w-5 h-5 text-emerald-600" />
                <span>Automated Purchase Orders & Replenishment Stream</span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Audit trail of issued purchase orders generated for low-stock SKUs reaching reorder points.
              </p>
            </div>
            <div className="flex items-center space-x-2">
              <span className="text-xs font-mono text-emerald-800 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-200 font-bold">
                {purchaseOrders.length} POs Total
              </span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-700">
              <thead className="bg-slate-100 text-slate-700 uppercase text-xs tracking-wider border-b border-slate-200 font-mono font-bold">
                <tr>
                  <th className="py-3 px-4">PO Ref & Date</th>
                  <th className="py-3 px-4">SKU & Product</th>
                  <th className="py-3 px-4">Supplier / Vendor</th>
                  <th className="py-3 px-4">Reorder Qty & Price</th>
                  <th className="py-3 px-4">Total Order Cost</th>
                  <th className="py-3 px-4">Expected Delivery</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {purchaseOrders.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-12 text-slate-400">
                      No purchase orders recorded yet. Click 'Generate Purchase Order' on any low-stock SKU to issue a PO.
                    </td>
                  </tr>
                ) : (
                  purchaseOrders.map((po) => (
                    <tr key={po.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-3.5 px-4">
                        <div className="font-mono font-bold text-emerald-700 text-xs">{po.id}</div>
                        <div className="text-[11px] text-slate-500 font-mono flex items-center space-x-1 mt-0.5">
                          <Clock className="w-3 h-3 text-slate-400" />
                          <span>{po.createdAt}</span>
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-slate-900">{po.itemName}</div>
                        <div className="text-xs font-mono text-purple-700 font-bold">{po.sku}</div>
                      </td>
                      <td className="py-3.5 px-4 text-xs font-medium text-slate-700">
                        <div className="flex items-center space-x-1">
                          <Building2 className="w-3.5 h-3.5 text-slate-400" />
                          <span>{po.supplier}</span>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 font-mono text-xs">
                        <div className="font-bold text-slate-900">{po.reorderQuantity} units</div>
                        <div className="text-slate-500 text-[11px]">${po.unitCost.toFixed(2)} / unit</div>
                      </td>
                      <td className="py-3.5 px-4 font-mono text-sm font-bold text-emerald-700">
                        ${po.totalCost.toFixed(2)}
                      </td>
                      <td className="py-3.5 px-4 text-xs font-mono text-slate-700">
                        <div className="flex items-center space-x-1">
                          <Truck className="w-3.5 h-3.5 text-blue-600" />
                          <span>{po.expectedDeliveryDate}</span>
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-mono font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                          {po.status}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end space-x-2">
                          <button
                            onClick={() => handleOpenInboundFromPo(po)}
                            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-lg shadow-xs inline-flex items-center space-x-1.5 cursor-pointer"
                            title="Pre-fill inbound stock receiving modal for this PO"
                          >
                            <PackagePlus className="w-3.5 h-3.5" />
                            <span>Receive Inbound</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDeletePurchaseOrder(po)}
                            className="px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 rounded-lg font-bold text-xs transition-all cursor-pointer inline-flex items-center space-x-1 shadow-2xs"
                            title="Delete Purchase Order"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Delete</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* VIEW MODE 4: REPORTS & DATE ANALYTICS GENERATOR */}
      {activeViewMode === 'reports' && (
        <InventoryReportGenerator
          skus={skus}
          batches={batches}
          locations={locations}
          zones={zones}
          stockMovements={stockMovements}
          currentUser={currentUser}
          onRefresh={onRefresh}
          onLogAuditActivity={onLogAuditActivity}
        />
      )}

      {/* VIEW MODE 5: MANAGE WAREHOUSE FACILITIES, ZONES & PUTAWAY BIN LOCATIONS */}
      {activeViewMode === 'facilities' && (
        <div className="space-y-6">
          {/* Section Header */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xs">
            <div>
              <div className="flex items-center space-x-2">
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-teal-100 text-teal-800 border border-teal-200 uppercase font-mono">
                  Warehouse Master Data
                </span>
                <h3 className="font-bold text-slate-900 text-lg flex items-center space-x-2">
                  <Building2 className="w-5 h-5 text-teal-600" />
                  <span>Facilities & Zones</span>
                </h3>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Configure facility layout, storage temperature zones, rack aisles, and individual Putaway Bin Locations for optimal FEFO putaway and picking efficiency.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={handleOpenCreateFacilityModal}
                className="flex items-center space-x-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-xs shadow-xs cursor-pointer transition-all shrink-0"
              >
                <Building2 className="w-4 h-4" />
                <span>+ Add Facility</span>
              </button>
              <button
                onClick={handleOpenCreateZoneModal}
                className="flex items-center space-x-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs shadow-xs cursor-pointer transition-all shrink-0"
              >
                <Layers className="w-4 h-4" />
                <span>+ Add Storage Zone</span>
              </button>
              <button
                onClick={handleOpenCreateLocationModal}
                className="flex items-center space-x-1.5 px-3.5 py-2 bg-teal-600 hover:bg-teal-500 text-white font-bold rounded-xl text-xs shadow-xs cursor-pointer transition-all shrink-0"
              >
                <PlusCircle className="w-4 h-4" />
                <span>+ Create Bin Location</span>
              </button>
            </div>
          </div>

          {/* Section 1: Warehouse Facilities Directory */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center space-x-2">
                <Building2 className="w-5 h-5 text-indigo-600" />
                <h4 className="font-bold text-slate-900 text-base">Warehouse Facilities Directory</h4>
                <span className="px-2 py-0.5 rounded-full text-xs font-mono font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                  {(facilities.length > 0 ? facilities : INITIAL_FACILITIES).length} Registered
                </span>
              </div>
              <button
                onClick={handleOpenCreateFacilityModal}
                className="text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center space-x-1 cursor-pointer"
              >
                <PlusCircle className="w-3.5 h-3.5" />
                <span>Add New Facility</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {facilities.length === 0 ? (
                <div className="col-span-full border border-dashed border-slate-300 rounded-xl p-8 text-center bg-slate-50">
                  <Building2 className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                  <p className="text-sm font-bold text-slate-700">No Warehouse Facilities Registered</p>
                  <p className="text-xs text-slate-500 mb-4">Add a new facility to organize storage zones and putaway bins.</p>
                  <button
                    onClick={handleOpenCreateFacilityModal}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl cursor-pointer"
                  >
                    + Add Warehouse Facility
                  </button>
                </div>
              ) : (
                facilities.map((fac) => {
                  const facZonesCount = zones.filter((z) => z.facilityId === fac.id || z.facilityId === fac.code).length;
                  return (
                    <div key={fac.id} className="border border-slate-200 bg-slate-50/50 hover:bg-white rounded-xl p-4 shadow-xs transition-all space-y-3 relative group">
                      <div className="flex items-start justify-between">
                        <div>
                          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-indigo-100 text-indigo-800 border border-indigo-200">
                            {fac.code}
                          </span>
                          <h5 className="font-bold text-slate-900 text-sm mt-1">{fac.name}</h5>
                          {fac.address && <p className="text-xs text-slate-500 font-medium">{fac.address}</p>}
                        </div>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          fac.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                        }`}>
                          {fac.status || 'ACTIVE'}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs text-slate-600 pt-2 border-t border-slate-200/80">
                        <div>
                          <span className="text-[10px] text-slate-400 block font-mono uppercase">Facility Manager</span>
                          <span className="font-semibold text-slate-800">{fac.managerName || 'Operations Lead'}</span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400 block font-mono uppercase">Total Area</span>
                          <span className="font-bold text-slate-800">{(fac.totalAreaSqFt || 45000).toLocaleString()} sq ft</span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t border-slate-200/80">
                        <span className="text-xs text-slate-500 font-mono">
                          <strong className="text-indigo-600 font-bold">{facZonesCount}</strong> Storage Zones
                        </span>

                        <div className="flex items-center space-x-1.5">
                          <button
                            onClick={() => handleOpenEditFacilityModal(fac)}
                            className="px-2.5 py-1 bg-white hover:bg-indigo-50 text-indigo-700 border border-slate-200 hover:border-indigo-300 rounded-lg text-xs font-bold cursor-pointer transition-colors flex items-center space-x-1"
                            title="Edit Facility details"
                          >
                            <Edit3 className="w-3 h-3" />
                            <span>Edit</span>
                          </button>
                          <button
                            onClick={() => handleDeleteFacilityClick(fac.id, fac.name)}
                            className="px-2.5 py-1 bg-white hover:bg-rose-50 text-rose-600 border border-slate-200 hover:border-rose-300 rounded-lg text-xs font-bold cursor-pointer transition-colors flex items-center space-x-1"
                            title="Delete Facility"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>DEL</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Section 2: Storage Temperature Zones Overview & Management */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h4 className="font-bold text-slate-900 text-base flex items-center space-x-2">
                  <MapPin className="w-5 h-5 text-emerald-600" />
                  <span>Storage Temperature Zones Overview</span>
                </h4>
                <p className="text-xs text-slate-500 mt-0.5">
                  Climate control zones, temperature ranges, aisles, and target FEFO bin allocations
                </p>
              </div>
              <button
                onClick={handleOpenCreateZoneModal}
                className="text-xs font-bold text-emerald-600 hover:text-emerald-800 flex items-center space-x-1 cursor-pointer"
              >
                <PlusCircle className="w-3.5 h-3.5" />
                <span>Add Storage Zone</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
              {zones.length === 0 ? (
                <div className="col-span-full border border-dashed border-slate-300 rounded-xl p-8 text-center bg-slate-50">
                  <Layers className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                  <p className="text-sm font-bold text-slate-700">No Storage Zones Registered</p>
                  <p className="text-xs text-slate-500 mb-4">Create climate control zones (e.g. Cold Storage, High Velocity, Dry).</p>
                  <button
                    onClick={handleOpenCreateZoneModal}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl cursor-pointer"
                  >
                    + Add Storage Zone
                  </button>
                </div>
              ) : (
                zones.map((z) => {
                  const zoneLocations = locations.filter((l) => l.zone === z.code);
                  const totalCapacity = zoneLocations.reduce((sum, l) => sum + (l.capacityKg || 500), 0);
                  const totalCurrent = zoneLocations.reduce((sum, l) => sum + (l.currentKg || 0), 0);
                  const utilPct = totalCapacity > 0 ? Math.min(100, Math.round((totalCurrent / totalCapacity) * 100)) : 0;

                  return (
                    <div
                      key={z.code}
                      className={`p-4 rounded-xl border transition-all hover:shadow-md flex flex-col justify-between ${
                        facilityZoneFilter === z.code ? 'ring-2 ring-teal-500 shadow-md bg-white border-teal-300' : 'bg-slate-50/80 border-slate-200 hover:bg-white'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between">
                          <span className="text-2xl">{z.icon || '📦'}</span>
                          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-200 text-slate-800">
                            {zoneLocations.length} Bins
                          </span>
                        </div>
                        <h5 className="font-bold text-slate-900 text-sm mt-2">{z.title}</h5>
                        <p className="text-[11px] text-emerald-700 font-semibold">{z.temperatureRange}</p>
                        {z.description && <p className="text-[10px] text-slate-500 mt-1 line-clamp-2">{z.description}</p>}
                        {z.aisle && <p className="text-[10px] text-slate-600 font-mono mt-1">Aisle: {z.aisle}</p>}
                      </div>

                      <div className="mt-3 pt-2 border-t border-slate-200/80 space-y-2">
                        <div className="flex justify-between text-[10px] font-mono text-slate-600">
                          <span>Load Utilized:</span>
                          <span className="font-bold">{utilPct}%</span>
                        </div>
                        <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              utilPct > 85 ? 'bg-rose-500' : utilPct > 60 ? 'bg-amber-500' : 'bg-emerald-500'
                            }`}
                            style={{ width: `${utilPct}%` }}
                          />
                        </div>

                        <div className="flex items-center justify-between pt-1">
                          <button
                            onClick={() => setFacilityZoneFilter(facilityZoneFilter === z.code ? 'ALL' : z.code)}
                            className={`text-[10px] font-bold px-2 py-0.5 rounded cursor-pointer ${
                              facilityZoneFilter === z.code ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                            }`}
                          >
                            {facilityZoneFilter === z.code ? 'Filter Active' : 'Filter Bins'}
                          </button>

                          <div className="flex items-center space-x-1">
                            <button
                              onClick={() => handleOpenEditZoneModal(z)}
                              className="p-1 hover:bg-slate-200 rounded text-slate-600 cursor-pointer"
                              title="Edit Storage Zone"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeleteZoneClick(z.code, z.title)}
                              className="px-2 py-1 bg-white hover:bg-rose-50 text-rose-600 border border-slate-200 hover:border-rose-300 rounded-lg text-xs font-bold cursor-pointer transition-colors flex items-center space-x-1"
                              title="Delete Storage Zone"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>DEL</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Section 3: Putaway Bin Locations Directory */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden space-y-4 p-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200">
              <div>
                <h4 className="font-bold text-slate-900 text-base">Putaway Bin Locations Directory</h4>
                <p className="text-xs text-slate-500">
                  All registered rack aisles, shelf bins, and putaway bin locations in Main Distribution Facility.
                </p>
              </div>

              {/* Filters */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    placeholder="Search Bin ID or Aisle..."
                    value={facilitySearchQuery}
                    onChange={(e) => setFacilitySearchQuery(e.target.value)}
                    className="pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-teal-500 w-48 font-mono"
                  />
                </div>

                <select
                  value={facilityZoneFilter}
                  onChange={(e) => setFacilityZoneFilter(e.target.value)}
                  className="px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-teal-500 font-medium"
                >
                  <option value="ALL">All Storage Zones</option>
                  {(zones.length > 0 ? zones : INITIAL_ZONES).map((z) => (
                    <option key={z.code} value={z.code}>
                      {z.title}
                    </option>
                  ))}
                </select>

                {facilityZoneFilter !== 'ALL' && (
                  <button
                    onClick={() => setFacilityZoneFilter('ALL')}
                    className="px-2.5 py-1.5 text-xs text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg font-semibold cursor-pointer"
                  >
                    Clear Filter
                  </button>
                )}
              </div>
            </div>

            {/* Locations Directory Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 font-mono text-[11px] uppercase border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-4 font-bold">Putaway Bin ID</th>
                    <th className="py-3 px-4 font-bold">Aisle / Rack / Shelf / Bin</th>
                    <th className="py-3 px-4 font-bold">Storage Zone</th>
                    <th className="py-3 px-4 font-bold">Current Load (kg)</th>
                    <th className="py-3 px-4 font-bold">Max Capacity</th>
                    <th className="py-3 px-4 font-bold">Utilization</th>
                    <th className="py-3 px-4 font-bold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {locations
                    .filter((loc) => {
                      if (facilityZoneFilter !== 'ALL' && loc.zone !== facilityZoneFilter) return false;
                      if (facilitySearchQuery.trim()) {
                        const q = facilitySearchQuery.toLowerCase();
                        return loc.id.toLowerCase().includes(q) || loc.aisle.toLowerCase().includes(q);
                      }
                      return true;
                    })
                    .map((loc) => {
                      const cap = loc.capacityKg || 500;
                      const cur = loc.currentKg || 0;
                      const util = Math.min(100, Math.round((cur / cap) * 100));

                      return (
                        <tr key={loc.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-3 px-4 font-mono font-bold text-slate-900 text-sm">
                            <div className="flex items-center space-x-1.5">
                              <MapPin className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                              <span>{loc.id}</span>
                            </div>
                          </td>
                          <td className="py-3 px-4 font-mono text-slate-700">
                            Aisle <strong className="text-slate-900">{loc.aisle}</strong> • Rack <strong className="text-slate-900">{loc.rack}</strong> • Shelf <strong className="text-slate-900">{loc.shelf}</strong> • Bin <strong className="text-slate-900">{loc.bin}</strong>
                          </td>
                          <td className="py-3 px-4">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                                loc.zone === 'COLD_STORAGE'
                                  ? 'bg-blue-100 text-blue-800'
                                  : loc.zone === 'HIGH_VELOCITY'
                                  ? 'bg-purple-100 text-purple-800'
                                  : loc.zone === 'DRY'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : loc.zone === 'HAZMAT'
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-slate-200 text-slate-800'
                              }`}
                            >
                              {loc.zone}
                            </span>
                          </td>
                          <td className="py-3 px-4 font-mono font-bold text-slate-900">
                            {cur} kg
                          </td>
                          <td className="py-3 px-4 font-mono text-slate-600">
                            {cap} kg
                          </td>
                          <td className="py-3 px-4 w-36 font-mono">
                            <div className="space-y-1">
                              <div className="flex justify-between text-[10px] text-slate-600">
                                <span>{util}%</span>
                                <span className={util >= 90 ? 'text-rose-600 font-bold' : 'text-slate-500'}>
                                  {util >= 90 ? 'NEAR FULL' : util > 0 ? 'ACTIVE' : 'EMPTY'}
                                </span>
                              </div>
                              <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden border border-slate-200">
                                <div
                                  className={`h-full rounded-full ${
                                    util >= 90 ? 'bg-rose-500' : util >= 50 ? 'bg-amber-500' : 'bg-teal-500'
                                  }`}
                                  style={{ width: `${util}%` }}
                                />
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end space-x-1">
                              <button
                                onClick={() => handleOpenEditLocationModal(loc)}
                                className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-xs font-semibold cursor-pointer"
                                title="Edit Location Settings"
                              >
                                <Edit3 className="w-3 h-3 text-slate-600" />
                              </button>
                              <button
                                onClick={() => handleDeleteLocationClick(loc.id)}
                                className="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-xs font-bold cursor-pointer transition-colors flex items-center space-x-1"
                                title="Delete Location"
                              >
                                <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                                <span>DEL</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* GENERATE PURCHASE ORDER MODAL */}
      {selectedPoSku && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full p-6 shadow-2xl relative space-y-5 animate-fade-in text-slate-900">
            <button
              onClick={() => setSelectedPoSku(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-700 p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center space-x-3">
              <div className="p-3 bg-purple-100 border border-purple-200 rounded-xl text-purple-700">
                <ShoppingCart className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-lg">Generate Purchase Order</h3>
                <p className="text-xs text-slate-500">Reorder stock replenishment from vendor</p>
              </div>
            </div>

            {/* Selected SKU Card & Reorder Metrics */}
            <div className="p-4 bg-slate-50 border border-purple-200 rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-bold text-slate-900 text-base block">{selectedPoSku.name}</span>
                  <span className="text-xs font-mono text-slate-500">{selectedPoSku.category} • Storage: {selectedPoSku.storageZone}</span>
                </div>
                <span className="text-xs font-mono text-purple-800 bg-purple-100 px-2.5 py-1 rounded-md border border-purple-200 font-bold">
                  {selectedPoSku.sku}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-xs font-mono pt-2 border-t border-slate-200">
                <div className="bg-white p-2 rounded border border-slate-200">
                  <span className="text-slate-500 block text-[10px]">CURRENT STOCK</span>
                  <strong className="text-amber-700 font-bold text-sm">{skuStockMap.get(selectedPoSku.sku)?.totalOnHand || 0} {selectedPoSku.unit}</strong>
                </div>
                <div className="bg-white p-2 rounded border border-slate-200">
                  <span className="text-slate-500 block text-[10px]">REORDER POINT</span>
                  <strong className="text-slate-900 font-bold text-sm">{selectedPoSku.reorderPoint} {selectedPoSku.unit}</strong>
                </div>
                <div className="bg-white p-2 rounded border border-slate-200">
                  <span className="text-slate-500 block text-[10px]">SAFETY STOCK</span>
                  <strong className="text-slate-700 font-bold text-sm">{selectedPoSku.safetyStock} {selectedPoSku.unit}</strong>
                </div>
              </div>
            </div>

            <form onSubmit={handleConfirmGeneratePo} className="space-y-4">
              
              {/* Order Quantity & Quick Presets */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-slate-700">Reorder Quantity ({selectedPoSku.unit})</label>
                  <span className="text-[11px] text-slate-500 font-mono">Suggested: {Math.max(50, Math.ceil((selectedPoSku.reorderPoint * 2 - (skuStockMap.get(selectedPoSku.sku)?.totalOnHand || 0)) / 25) * 25)}</span>
                </div>
                <input
                  type="number"
                  min="1"
                  required
                  value={poOrderQty}
                  onChange={(e) => setPoOrderQty(Number(e.target.value))}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2.5 text-sm text-slate-900 font-mono focus:bg-white focus:outline-none focus:border-purple-500"
                />
                {/* Preset buttons */}
                <div className="flex items-center space-x-2 mt-2">
                  <span className="text-[10px] text-slate-500 uppercase font-mono">Presets:</span>
                  {[25, 50, 100, 200, 500].map((qty) => (
                    <button
                      key={qty}
                      type="button"
                      onClick={() => setPoOrderQty(qty)}
                      className={`px-2 py-0.5 text-xs font-mono rounded border transition-colors cursor-pointer ${
                        poOrderQty === qty
                          ? 'bg-purple-600 text-white border-purple-500 font-bold'
                          : 'bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200'
                      }`}
                    >
                      +{qty}
                    </button>
                  ))}
                </div>
              </div>

              {/* Unit Cost, Expected Delivery & Vendor */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {enableInboundSupplier && (
                  <div className="sm:col-span-2">
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-semibold text-slate-700">Target Vendor / Supplier Name</label>
                      <span className="text-[10px] text-blue-600 font-bold bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                        Admin Feature Ticked
                      </span>
                    </div>
                    <input
                      type="text"
                      required={enableInboundSupplier}
                      value={poSupplier}
                      onChange={(e) => setPoSupplier(e.target.value)}
                      placeholder="e.g., Premier Global Logistics, Kyoto Green Tea Corp"
                      className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2.5 text-sm text-slate-900 focus:bg-white focus:outline-none focus:border-purple-500"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Unit Cost ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.10"
                    required
                    value={poUnitCost}
                    onChange={(e) => setPoUnitCost(Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2.5 text-sm text-slate-900 font-mono focus:bg-white focus:outline-none focus:border-purple-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Expected Delivery Date</label>
                  <input
                    type="date"
                    required
                    value={poDeliveryDate}
                    onChange={(e) => setPoDeliveryDate(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2.5 text-sm text-slate-900 font-mono focus:bg-white focus:outline-none focus:border-purple-500"
                  />
                </div>
              </div>

              {/* Real-time Order Summary Card */}
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between text-xs font-mono">
                <span className="text-slate-600 font-medium">Total Purchase Order Value:</span>
                <span className="text-emerald-700 font-bold text-base">
                  ${(poOrderQty * poUnitCost).toFixed(2)} USD
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Purchase Order Notes / Instructions</label>
                <textarea
                  rows={2}
                  value={poNotes}
                  onChange={(e) => setPoNotes(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-purple-500"
                />
              </div>

              <div className="pt-2 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setSelectedPoSku(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isGeneratingPo}
                  className="px-5 py-2.5 bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold rounded-lg shadow-xs flex items-center space-x-2 cursor-pointer transition-all"
                >
                  <ShoppingCart className="w-4 h-4" />
                  <span>{isGeneratingPo ? 'Issuing PO...' : 'Issue Purchase Order'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Stock Movement Log Drawer Modal */}
      {showMovementLogDrawer && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex justify-end">
          <div className="w-full max-w-md bg-white border-l border-slate-200 h-full p-6 overflow-y-auto flex flex-col justify-between shadow-2xl text-slate-900">
            <div>
              <div className="flex items-center justify-between pb-4 border-b border-slate-200">
                <div className="flex items-center space-x-2">
                  <History className="w-5 h-5 text-blue-600" />
                  <div>
                    <h3 className="font-bold text-slate-900 text-lg">Stock Movement Stream</h3>
                    <p className="text-2xs text-slate-500 font-medium">{stockMovements.length} total logged events</p>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  {stockMovements.length > 0 && (
                    <button
                      type="button"
                      onClick={handleClearStockMovementsClick}
                      className="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 rounded-lg text-xs font-bold inline-flex items-center space-x-1 transition-all cursor-pointer shadow-2xs"
                      title="Clear all recorded stock movement stream logs"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Clear Stream</span>
                    </button>
                  )}
                  <button
                    onClick={() => setShowMovementLogDrawer(false)}
                    className="p-1.5 hover:bg-slate-100 text-slate-500 rounded-lg transition-colors cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              <div className="mt-4 space-y-3">
                {stockMovements.length === 0 ? (
                  <div className="py-12 text-center text-slate-400 space-y-2">
                    <History className="w-8 h-8 mx-auto text-slate-300" />
                    <p className="text-sm font-semibold text-slate-600">No stock movement logs found</p>
                    <p className="text-2xs text-slate-400">The movement log stream is clean and empty.</p>
                  </div>
                ) : (
                  stockMovements.map((movement) => (
                    <div
                      key={movement.id}
                      className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-1"
                    >
                      <div className="flex items-center justify-between font-mono">
                        <span className="text-slate-500">{movement.timestamp}</span>
                        <span
                          className={`px-1.5 py-0.5 rounded font-semibold ${
                            movement.type === 'INBOUND_RECEIVE'
                              ? 'bg-emerald-100 text-emerald-800'
                              : movement.type === 'PICKING'
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {movement.type}
                        </span>
                      </div>
                      <div className="font-bold text-slate-900">{movement.itemName} ({movement.quantity} units)</div>
                      <div className="text-slate-600 flex items-center space-x-2 font-mono">
                        <span>Batch: {movement.batchNo}</span>
                        {movement.toLocation && <span>📍 {movement.toLocation}</span>}
                      </div>
                      <div className="text-slate-500 pt-1 border-t border-slate-200 flex justify-between">
                        <span>By: {movement.operator}</span>
                        <span>Ref: {movement.referenceDoc}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Inbound Stock Modal */}
      {showInboundModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full p-6 shadow-2xl relative text-slate-900">
            <button
              onClick={() => setShowInboundModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-700 p-1 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center space-x-3 mb-4">
              <div className="p-2.5 bg-blue-100 border border-blue-200 rounded-xl text-blue-600">
                <PlusCircle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-lg">Inbound Stock Receiving</h3>
                <p className="text-xs text-slate-500">Record new arrival with Batch # & Best Before Date (BBD)</p>
              </div>
            </div>

            {feedbackMsg && (
              <div
                className={`p-3 rounded-lg text-xs mb-4 ${
                  feedbackMsg.type === 'success'
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                    : 'bg-rose-100 text-rose-800 border border-rose-200'
                }`}
              >
                {feedbackMsg.text}
              </div>
            )}

            <form onSubmit={handleInboundSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    1. Select SKU Product ({skus.length} catalog items)
                  </label>
                  <select
                    value={inboundSku}
                    onChange={(e) => handleInboundSkuChange(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2.5 text-sm font-medium text-slate-900 focus:bg-white focus:outline-none focus:border-blue-500"
                  >
                    {skus.map((sku) => (
                      <option key={sku.sku} value={sku.sku}>
                        {sku.name} ({sku.sku})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    2. Choose Product Category
                  </label>
                  <select
                    value={inboundCategory}
                    onChange={(e) => setInboundCategory(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2.5 text-sm font-medium text-slate-900 focus:bg-white focus:outline-none focus:border-blue-500"
                  >
                    {categoriesList.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {selectedInboundSkuObj && (
                <div className="p-2.5 bg-blue-50/70 border border-blue-200/80 rounded-xl flex flex-wrap items-center justify-between text-xs gap-2">
                  <div className="flex items-center space-x-2">
                    <span className="font-semibold text-slate-600">Assigned Category:</span>
                    <span className="px-2.5 py-0.5 bg-blue-600 text-white font-bold rounded-md text-xs shadow-2xs">
                      {inboundCategory || 'General Products'}
                    </span>
                  </div>
                  <div className="flex items-center space-x-3 text-2xs font-mono text-slate-600">
                    <span>Storage Zone: <strong className="text-slate-800">{selectedInboundSkuObj.storageZone}</strong></span>
                    <span>Reorder Point: <strong className="text-slate-800">{selectedInboundSkuObj.reorderPoint}</strong></span>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Batch / Lot Number</label>
                  <input
                    type="text"
                    required
                    value={inboundBatchNo}
                    onChange={(e) => setInboundBatchNo(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-sm text-slate-900 font-mono focus:bg-white focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Best Before Date (BBD)</label>
                  <input
                    type="date"
                    required
                    value={inboundBbd}
                    onChange={(e) => setInboundBbd(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-sm text-slate-900 font-mono focus:bg-white focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Putaway Bin Location</label>
                  <select
                    value={inboundLocationId}
                    onChange={(e) => setInboundLocationId(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-sm text-slate-900 font-mono focus:bg-white focus:outline-none focus:border-blue-500"
                  >
                    {locations.map((loc) => (
                      <option key={loc.id} value={loc.id}>
                        {loc.id} ({loc.zone})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Quantity Received</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={inboundQty}
                    onChange={(e) => setInboundQty(Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-sm text-slate-900 font-mono focus:bg-white focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold text-slate-700">
                    Incoming Stock Supplier / Vendor Information
                  </label>
                  {currentUser.role === 'Admin' && onToggleInboundSupplier ? (
                    <label className="flex items-center space-x-1.5 cursor-pointer text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                      <input
                        type="checkbox"
                        checked={enableInboundSupplier}
                        onChange={(e) => onToggleInboundSupplier(e.target.checked)}
                        className="w-3.5 h-3.5 text-blue-600 rounded border-slate-300 focus:ring-blue-500 cursor-pointer"
                      />
                      <span>Admin Tick Option</span>
                    </label>
                  ) : (
                    <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded ${
                      enableInboundSupplier ? 'bg-blue-100 text-blue-800' : 'bg-slate-200 text-slate-600'
                    }`}>
                      {enableInboundSupplier ? 'Supplier Required' : 'Supplier Optional'}
                    </span>
                  )}
                </div>

                {enableInboundSupplier ? (
                  <input
                    type="text"
                    required
                    value={inboundSupplier}
                    onChange={(e) => setInboundSupplier(e.target.value)}
                    placeholder="Enter supplier / vendor company name"
                    className="w-full bg-white border border-slate-300 rounded-lg p-2 text-sm text-slate-900 focus:outline-none focus:border-blue-500"
                  />
                ) : (
                  <div className="text-xs text-slate-500 italic bg-white p-2 rounded border border-slate-200">
                    Supplier/Vendor tracking is unticked/disabled by Admin configuration. Incoming stock will log under default supplier.
                  </div>
                )}
              </div>

              <div className="pt-2 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowInboundModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg shadow-xs"
                >
                  {isSubmitting ? 'Processing...' : 'Confirm Inbound Receive'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create New SKU Master Item Modal */}
      {showCreateSkuModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-xl w-full p-6 shadow-2xl relative text-slate-900">
            <button
              onClick={() => setShowCreateSkuModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-700 p-1 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center space-x-3 mb-4">
              <div className="p-2.5 bg-purple-100 border border-purple-200 rounded-xl text-purple-600">
                <PackagePlus className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-lg">Create New Master SKU Item</h3>
                <p className="text-xs text-slate-500">Register new product code in inventory master catalog with safety stock targets</p>
              </div>
            </div>

            <form onSubmit={handleCreateSkuSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">SKU Code (Unique ID)</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. SKU-BEV-999"
                    value={skuCode}
                    onChange={(e) => setSkuCode(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2.5 text-sm text-slate-900 font-mono uppercase focus:bg-white focus:outline-none focus:border-purple-500"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-semibold text-slate-700">Category</label>
                    <button
                      type="button"
                      onClick={() => {
                        setIsCustomCreateCategoryMode(!isCustomCreateCategoryMode);
                        if (!isCustomCreateCategoryMode) {
                          setCustomCreateCategoryInput('');
                        }
                      }}
                      className="text-[11px] text-purple-600 hover:text-purple-800 font-medium underline cursor-pointer"
                    >
                      {isCustomCreateCategoryMode ? '← Pick Existing' : '+ New Custom Category'}
                    </button>
                  </div>

                  {isCustomCreateCategoryMode ? (
                    <input
                      type="text"
                      required
                      placeholder="Type new category name..."
                      value={customCreateCategoryInput}
                      onChange={(e) => setCustomCreateCategoryInput(e.target.value)}
                      className="w-full bg-purple-50/50 border border-purple-300 rounded-lg p-2.5 text-sm text-purple-900 font-medium focus:bg-white focus:outline-none focus:border-purple-600"
                    />
                  ) : (
                    <select
                      value={skuCategory}
                      onChange={(e) => {
                        if (e.target.value === '__ADD_NEW__') {
                          setIsCustomCreateCategoryMode(true);
                          setCustomCreateCategoryInput('');
                        } else {
                          setSkuCategory(e.target.value);
                        }
                      }}
                      className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2.5 text-sm text-slate-900 focus:bg-white focus:outline-none focus:border-purple-500"
                    >
                      {categoriesList.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                      <option value="__ADD_NEW__">+ Add Custom Category...</option>
                    </select>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Product Title / Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Organic Almond Milk 1L Pack"
                  value={skuName}
                  onChange={(e) => setSkuName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2.5 text-sm text-slate-900 focus:bg-white focus:outline-none focus:border-purple-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Description / Notes</label>
                <textarea
                  rows={2}
                  placeholder="e.g. TetraPak packaging, keep refrigerated below 4°C"
                  value={skuDescription}
                  onChange={(e) => setSkuDescription(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2.5 text-sm text-slate-900 focus:bg-white focus:outline-none focus:border-purple-500"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Unit of Measure</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. cases, cartons, units"
                    value={skuUnit}
                    onChange={(e) => setSkuUnit(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-sm text-slate-900 focus:bg-white focus:outline-none focus:border-purple-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Reorder Point</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={skuReorderPoint}
                    onChange={(e) => setSkuReorderPoint(Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-sm text-slate-900 font-mono focus:bg-white focus:outline-none focus:border-purple-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Safety Stock</label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={skuSafetyStock}
                    onChange={(e) => setSkuSafetyStock(Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-sm text-slate-900 font-mono focus:bg-white focus:outline-none focus:border-purple-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Storage Zone</label>
                  <select
                    value={skuStorageZone}
                    onChange={(e) => setSkuStorageZone(e.target.value as any)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2.5 text-sm text-slate-900 focus:bg-white focus:outline-none focus:border-purple-500"
                  >
                    <option value="COLD_STORAGE">Cold Storage (Aisle A)</option>
                    <option value="HIGH_VELOCITY">High Velocity (Aisle B)</option>
                    <option value="DRY">Dry Storage (Aisle C)</option>
                    <option value="HAZMAT">Pharma / Hazmat (Aisle D)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Barcode / EAN (Optional)</label>
                  <input
                    type="text"
                    placeholder="Auto-generated if empty"
                    value={skuBarcode}
                    onChange={(e) => setSkuBarcode(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2.5 text-sm text-slate-900 font-mono focus:bg-white focus:outline-none focus:border-purple-500"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-slate-200 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowCreateSkuModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingSku}
                  className="px-5 py-2 bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold rounded-lg shadow-xs cursor-pointer"
                >
                  {isSubmittingSku ? 'Saving SKU...' : 'Create SKU Item'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit SKU & Category Modal */}
      {showEditSkuModal && editingSku && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-xl w-full p-6 shadow-2xl relative text-slate-900">
            <button
              onClick={() => setShowEditSkuModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-700 p-1 rounded-lg cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center space-x-3 mb-4">
              <div className="p-2.5 bg-purple-100 border border-purple-200 rounded-xl text-purple-600">
                <Edit3 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-lg">Edit SKU Master & Category</h3>
                <p className="text-xs text-slate-500">
                  Update category, product details, reorder points and safety stock for <span className="font-mono font-bold text-purple-700">{editingSku.sku}</span>
                </p>
              </div>
            </div>

            <form onSubmit={handleEditSkuSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">SKU Code (Read-Only)</label>
                  <input
                    type="text"
                    disabled
                    value={editingSku.sku}
                    className="w-full bg-slate-100 border border-slate-200 rounded-lg p-2.5 text-sm text-slate-500 font-mono font-bold cursor-not-allowed"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-semibold text-slate-700">Category</label>
                    <button
                      type="button"
                      onClick={() => {
                        setIsCustomEditCategoryMode(!isCustomEditCategoryMode);
                        if (!isCustomEditCategoryMode) {
                          setCustomEditCategoryInput('');
                        }
                      }}
                      className="text-[11px] text-purple-600 hover:text-purple-800 font-medium underline cursor-pointer"
                    >
                      {isCustomEditCategoryMode ? '← Pick Existing' : '+ New Category'}
                    </button>
                  </div>

                  {isCustomEditCategoryMode ? (
                    <input
                      type="text"
                      required
                      placeholder="Type custom category name..."
                      value={customEditCategoryInput}
                      onChange={(e) => setCustomEditCategoryInput(e.target.value)}
                      className="w-full bg-purple-50/50 border border-purple-300 rounded-lg p-2.5 text-sm text-purple-900 font-medium focus:bg-white focus:outline-none focus:border-purple-600"
                    />
                  ) : (
                    <select
                      value={editSkuCategory}
                      onChange={(e) => {
                        if (e.target.value === '__ADD_NEW__') {
                          setIsCustomEditCategoryMode(true);
                          setCustomEditCategoryInput('');
                        } else {
                          setEditSkuCategory(e.target.value);
                        }
                      }}
                      className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2.5 text-sm text-slate-900 focus:bg-white focus:outline-none focus:border-purple-500"
                    >
                      {categoriesList.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                      <option value="__ADD_NEW__">+ Add Custom Category...</option>
                    </select>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Product Title / Name</label>
                <input
                  type="text"
                  required
                  value={editSkuName}
                  onChange={(e) => setEditSkuName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2.5 text-sm text-slate-900 focus:bg-white focus:outline-none focus:border-purple-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Description / Notes</label>
                <textarea
                  rows={2}
                  value={editSkuDescription}
                  onChange={(e) => setEditSkuDescription(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2.5 text-sm text-slate-900 focus:bg-white focus:outline-none focus:border-purple-500"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Unit of Measure</label>
                  <input
                    type="text"
                    required
                    value={editSkuUnit}
                    onChange={(e) => setEditSkuUnit(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-sm text-slate-900 focus:bg-white focus:outline-none focus:border-purple-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Reorder Point</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={editSkuReorderPoint}
                    onChange={(e) => setEditSkuReorderPoint(Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-sm text-slate-900 font-mono focus:bg-white focus:outline-none focus:border-purple-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Safety Stock</label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={editSkuSafetyStock}
                    onChange={(e) => setEditSkuSafetyStock(Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-sm text-slate-900 font-mono focus:bg-white focus:outline-none focus:border-purple-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Storage Zone</label>
                  <select
                    value={editSkuStorageZone}
                    onChange={(e) => setEditSkuStorageZone(e.target.value as any)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2.5 text-sm text-slate-900 focus:bg-white focus:outline-none focus:border-purple-500"
                  >
                    <option value="COLD_STORAGE">Cold Storage (Aisle A)</option>
                    <option value="HIGH_VELOCITY">High Velocity (Aisle B)</option>
                    <option value="DRY">Dry Storage (Aisle C)</option>
                    <option value="HAZMAT">Pharma / Hazmat (Aisle D)</option>
                  </select>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-200 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowEditSkuModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingEditSku}
                  className="px-5 py-2 bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold rounded-lg shadow-xs cursor-pointer"
                >
                  {isSubmittingEditSku ? 'Saving Changes...' : 'Save SKU & Category'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Global Rename Existing Category Modal */}
      {showRenameCategoryModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 shadow-2xl relative text-slate-900">
            <button
              onClick={() => setShowRenameCategoryModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-700 p-1 rounded-lg cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center space-x-3 mb-4">
              <div className="p-2.5 bg-purple-100 border border-purple-200 rounded-xl text-purple-600">
                <FolderEdit className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-lg">Manage & Delete Categories</h3>
                <p className="text-xs text-slate-500">
                  Rename or delete categories globally across all catalog SKUs and active inventory batches
                </p>
              </div>
            </div>

            <form onSubmit={handleRenameCategorySubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Select Current Category</label>
                <select
                  value={renameOldCategory}
                  onChange={(e) => {
                    setRenameOldCategory(e.target.value);
                    setRenameNewCategory(e.target.value);
                    setShowConfirmDeleteCategory(false);
                  }}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2.5 text-sm text-slate-900 focus:bg-white focus:outline-none focus:border-purple-500 font-medium"
                >
                  {categoriesList.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">New Category Name (for Rename)</label>
                <input
                  type="text"
                  placeholder="e.g. Chilled Dairy Products"
                  value={renameNewCategory}
                  onChange={(e) => setRenameNewCategory(e.target.value)}
                  className="w-full bg-purple-50/50 border border-purple-300 rounded-lg p-2.5 text-sm text-slate-900 font-semibold focus:bg-white focus:outline-none focus:border-purple-600"
                />
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800">
                <strong>Note:</strong> Renaming will update all matching SKUs. Deleting a category will remove it and reassign SKUs to 'General Products'.
              </div>

              {showConfirmDeleteCategory ? (
                <div className="bg-rose-50 border border-rose-300 rounded-xl p-3.5 space-y-2.5 my-2 animate-fadeIn">
                  <div className="flex items-center space-x-2 text-rose-800 text-xs font-bold">
                    <Trash2 className="w-4 h-4 text-rose-600 shrink-0" />
                    <span>Confirm Deletion: '{renameOldCategory}'</span>
                  </div>
                  <p className="text-xs text-rose-700">
                    Are you sure you want to delete category <strong>'{renameOldCategory}'</strong>? All SKUs currently under this category will be automatically reassigned to <strong>'General Products'</strong>.
                  </p>
                  <div className="flex items-center justify-end space-x-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setShowConfirmDeleteCategory(false)}
                      className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg cursor-pointer transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleDeleteCategorySubmit}
                      disabled={isSubmittingRenameCategory}
                      className="px-4 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-lg shadow-xs cursor-pointer flex items-center space-x-1.5 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>{isSubmittingRenameCategory ? 'Deleting...' : 'Yes, Delete Category'}</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="pt-3 border-t border-slate-200 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setShowConfirmDeleteCategory(true)}
                    disabled={isSubmittingRenameCategory || !renameOldCategory}
                    className="flex items-center space-x-1.5 px-3.5 py-2 bg-rose-50 hover:bg-rose-100 border border-rose-300 text-rose-700 text-xs font-bold rounded-lg transition-all cursor-pointer"
                    title="Delete selected category and reassign SKUs to General Products"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                    <span>Delete Category</span>
                  </button>

                  <div className="flex space-x-2">
                    <button
                      type="button"
                      onClick={() => setShowRenameCategoryModal(false)}
                      className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmittingRenameCategory}
                      className="px-5 py-2 bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold rounded-lg shadow-xs cursor-pointer"
                    >
                      {isSubmittingRenameCategory ? 'Updating...' : 'Apply Rename'}
                    </button>
                  </div>
                </div>
              )}
            </form>
          </div>
        </div>
      )}

      {/* Stock Take Adjustment Modal */}
      {showStockTakeModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full p-6 shadow-2xl relative text-slate-900 max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setShowStockTakeModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-700 p-1 rounded-lg cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center space-x-3 mb-4">
              <div className="p-2.5 bg-amber-100 border border-amber-200 rounded-xl text-amber-700">
                <Sliders className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-lg">Stock Take & Physical Inventory Adjustment</h3>
                <p className="text-xs text-slate-500">
                  Reconcile physical floor counts, log shrinkage/spoilage, or record found stock variances with full audit trail
                </p>
              </div>
            </div>

            <form onSubmit={handleStockTakeSubmit} className="space-y-4">
              {/* Target SKU Selection */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Target Product SKU</label>
                <select
                  value={stockTakeSku}
                  onChange={(e) => {
                    const newSku = e.target.value;
                    setStockTakeSku(newSku);
                    const availBatches = batches.filter((b) => b.sku === newSku);
                    setStockTakeBatchNo(availBatches.length > 0 ? availBatches[0].batchNo : '');
                  }}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2.5 text-sm text-slate-900 font-bold focus:bg-white focus:outline-none focus:border-amber-500"
                >
                  {skus.map((s) => (
                    <option key={s.sku} value={s.sku}>
                      {s.sku} — {s.name} ({s.category})
                    </option>
                  ))}
                </select>
              </div>

              {/* Target Batch Selection */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Target Lot / Batch No (Optional)</label>
                <select
                  value={stockTakeBatchNo}
                  onChange={(e) => setStockTakeBatchNo(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2.5 text-sm text-slate-900 focus:bg-white focus:outline-none focus:border-amber-500"
                >
                  <option value="">General Stock (Apply to primary SKU batch)</option>
                  {batches
                    .filter((b) => b.sku === stockTakeSku)
                    .map((b) => (
                      <option key={b.id} value={b.batchNo}>
                        Lot #{b.batchNo} | Location: {b.locationId} | Current Qty: {b.quantityOnHand}
                      </option>
                    ))}
                </select>
              </div>

              {/* Adjustment Mode */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Adjustment Operation Mode</label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setStockTakeType('SET_EXACT')}
                    className={`p-2.5 rounded-lg border text-xs font-bold flex flex-col items-center justify-center transition-all cursor-pointer ${
                      stockTakeType === 'SET_EXACT'
                        ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <span>Physical Count</span>
                    <span className="text-[10px] opacity-80 font-normal">(Set New Total)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setStockTakeType('ADD')}
                    className={`p-2.5 rounded-lg border text-xs font-bold flex flex-col items-center justify-center transition-all cursor-pointer ${
                      stockTakeType === 'ADD'
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <span>Add Stock (+)</span>
                    <span className="text-[10px] opacity-80 font-normal">(Found / Over)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setStockTakeType('SUBTRACT')}
                    className={`p-2.5 rounded-lg border text-xs font-bold flex flex-col items-center justify-center transition-all cursor-pointer ${
                      stockTakeType === 'SUBTRACT'
                        ? 'bg-rose-600 text-white border-rose-600 shadow-xs'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <span>Deduct Stock (-)</span>
                    <span className="text-[10px] opacity-80 font-normal">(Shrink / Damage)</span>
                  </button>
                </div>
              </div>

              {/* Quantity Input & Live Variance Calculator */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {stockTakeType === 'SET_EXACT'
                    ? 'Physical Counted Quantity (Cases/Units)'
                    : stockTakeType === 'ADD'
                    ? 'Quantity to Add (+)'
                    : 'Quantity to Deduct (-)'}
                </label>
                <input
                  type="number"
                  min="0"
                  required
                  value={stockTakeCountedQty}
                  onChange={(e) => setStockTakeCountedQty(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2.5 text-base font-mono font-bold text-slate-900 focus:bg-white focus:outline-none focus:border-amber-500"
                />
              </div>

              {/* Live Variance Calculation Summary */}
              {(() => {
                const targetSkuObj = skus.find((s) => s.sku === stockTakeSku);
                const targetBatchObj = stockTakeBatchNo ? batches.find((b) => b.batchNo === stockTakeBatchNo) : null;
                const currentQty = targetBatchObj ? targetBatchObj.quantityOnHand : (targetSkuObj?.exactQty ?? targetSkuObj?.currentQty ?? 0);
                const valInput = Number(stockTakeCountedQty) || 0;
                const unitCost = targetSkuObj?.unitCost ?? 14.5;

                let calculatedVariance = 0;
                if (stockTakeType === 'SET_EXACT') {
                  calculatedVariance = valInput - currentQty;
                } else if (stockTakeType === 'ADD') {
                  calculatedVariance = valInput;
                } else if (stockTakeType === 'SUBTRACT') {
                  calculatedVariance = -valInput;
                }

                const newTotalStock = Math.max(0, currentQty + calculatedVariance);
                const valueImpact = calculatedVariance * unitCost;

                return (
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2 text-xs">
                    <div className="flex items-center justify-between text-slate-600">
                      <span>Current System Quantity:</span>
                      <span className="font-mono font-bold text-slate-900">{currentQty} {targetSkuObj?.unit || 'units'}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-700">Calculated Stock Variance:</span>
                      <span className={`font-mono font-black px-2 py-0.5 rounded text-xs ${
                        calculatedVariance > 0
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                          : calculatedVariance < 0
                          ? 'bg-rose-100 text-rose-800 border border-rose-300'
                          : 'bg-slate-200 text-slate-800'
                      }`}>
                        {calculatedVariance > 0 ? `+${calculatedVariance}` : calculatedVariance} units
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-slate-600">
                      <span>Post-Adjustment System Stock:</span>
                      <span className="font-mono font-bold text-blue-700">{newTotalStock} {targetSkuObj?.unit || 'units'}</span>
                    </div>
                    <div className="flex items-center justify-between pt-1 border-t border-slate-200 text-[11px] text-slate-500">
                      <span>Est. Financial Inventory Impact:</span>
                      <span className={`font-mono font-bold ${valueImpact >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                        {valueImpact >= 0 ? `+$${valueImpact.toFixed(2)}` : `-$${Math.abs(valueImpact).toFixed(2)}`}
                      </span>
                    </div>
                  </div>
                );
              })()}

              {/* Reason Code */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Reason Code for Audit</label>
                <select
                  value={stockTakeReason}
                  onChange={(e) => setStockTakeReason(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2.5 text-sm text-slate-900 focus:bg-white focus:outline-none focus:border-amber-500"
                >
                  <option value="CYCLE_COUNT">📦 Physical Cycle Count / Scheduled Audit</option>
                  <option value="DAMAGE_SPOILAGE">💥 Damaged / Broken / Defective Product</option>
                  <option value="EXPIRED">⏳ Expired Stock Removal</option>
                  <option value="DISCREPANCY">🔍 Inventory Discrepancy / Miscount</option>
                  <option value="SHRINKAGE">🛡️ Unaccounted Theft / Shrinkage</option>
                  <option value="FOUND_STOCK">📦 Found Unrecorded Inventory</option>
                  <option value="ADMIN_CORRECTION">📝 Administrative Correction</option>
                </select>
              </div>

              {/* Audit Remarks */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Audit Remarks / Notes</label>
                <textarea
                  rows={2}
                  placeholder="e.g. Aisle 3 Shelf B physical count verified by floor supervisor..."
                  value={stockTakeNotes}
                  onChange={(e) => setStockTakeNotes(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2.5 text-sm text-slate-900 focus:bg-white focus:outline-none focus:border-amber-500"
                />
              </div>

              {/* Operator info */}
              <div className="text-[11px] text-slate-500 bg-amber-50/60 border border-amber-200 p-2.5 rounded-lg">
                <span>Auditor Sign-off: </span>
                <span className="font-bold text-slate-800">{currentUser.name} ({currentUser.role})</span>
              </div>

              <div className="pt-3 border-t border-slate-200 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowStockTakeModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingStockTake}
                  className="px-5 py-2 bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold rounded-lg shadow-xs cursor-pointer flex items-center space-x-1.5"
                >
                  <Sliders className="w-4 h-4" />
                  <span>{isSubmittingStockTake ? 'Processing Adjustment...' : 'Apply Stock Take Adjustment'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create / Edit Putaway Bin Location Modal */}
      {showLocationModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 shadow-2xl text-slate-900 space-y-4 animate-fade-in">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center space-x-2">
                <Building2 className="w-5 h-5 text-teal-600" />
                <h3 className="font-bold text-slate-900 text-lg">
                  {editingLocation ? `Edit Location: ${editingLocation.id}` : 'Create Putaway Bin Location'}
                </h3>
              </div>
              <button
                onClick={() => setShowLocationModal(false)}
                className="p-1 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveLocationSubmit} className="space-y-3.5">
              {!editingLocation && (
                <div className="grid grid-cols-4 gap-2">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">Aisle</label>
                    <input
                      type="text"
                      required
                      maxLength={2}
                      placeholder="A"
                      value={locAisle}
                      onChange={(e) => setLocAisle(e.target.value.toUpperCase())}
                      className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-xs font-mono uppercase text-slate-900 focus:bg-white focus:outline-none focus:border-teal-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">Rack #</label>
                    <input
                      type="number"
                      min="1"
                      max="99"
                      required
                      value={locRack}
                      onChange={(e) => setLocRack(Number(e.target.value))}
                      className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-xs font-mono text-slate-900 focus:bg-white focus:outline-none focus:border-teal-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">Shelf #</label>
                    <input
                      type="number"
                      min="1"
                      max="9"
                      required
                      value={locShelf}
                      onChange={(e) => setLocShelf(Number(e.target.value))}
                      className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-xs font-mono text-slate-900 focus:bg-white focus:outline-none focus:border-teal-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">Bin Code</label>
                    <input
                      type="text"
                      required
                      maxLength={4}
                      placeholder="01"
                      value={locBin}
                      onChange={(e) => setLocBin(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-xs font-mono text-slate-900 focus:bg-white focus:outline-none focus:border-teal-500"
                    />
                  </div>
                </div>
              )}

              {!editingLocation && (
                <div className="p-2.5 bg-teal-50 border border-teal-200 rounded-xl text-xs font-mono text-teal-900 flex justify-between items-center">
                  <span className="text-slate-600">Generated Bin ID:</span>
                  <strong className="font-bold text-sm text-teal-800">
                    {locAisle.toUpperCase()}-{String(locRack).padStart(2, '0')}-{String(locBin).padStart(2, '0')}
                  </strong>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Storage Zone Type</label>
                <select
                  value={locZone}
                  onChange={(e) => setLocZone(e.target.value as ZoneType)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2.5 text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-teal-500 font-medium"
                >
                  <option value="COLD_STORAGE">Cold Storage (Aisle A) - Refrigerated 2-8°C</option>
                  <option value="HIGH_VELOCITY">High Velocity (Aisle B) - Fast-moving automated</option>
                  <option value="DRY">Dry Ambient Storage (Aisle C) - Pallet racking</option>
                  <option value="HAZMAT">Pharma / Hazmat (Aisle D) - Restricted access</option>
                  <option value="STAGING">Inbound Staging Bay - Receiving cross-dock</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Weight Capacity (kg)</label>
                <input
                  type="number"
                  min="50"
                  step="50"
                  required
                  value={locCapacityKg}
                  onChange={(e) => setLocCapacityKg(Number(e.target.value))}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2.5 text-xs font-mono text-slate-900 focus:bg-white focus:outline-none focus:border-teal-500"
                />
              </div>

              <div className="pt-3 border-t border-slate-200 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowLocationModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingLoc}
                  className="px-5 py-2 bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold rounded-lg shadow-xs cursor-pointer"
                >
                  {isSubmittingLoc ? 'Saving...' : editingLocation ? 'Update Location' : 'Create Location'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create / Edit Warehouse Facility Modal */}
      {showFacilityModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 shadow-2xl text-slate-900 space-y-4 animate-fade-in">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center space-x-2">
                <Building2 className="w-5 h-5 text-indigo-600" />
                <h3 className="font-bold text-slate-900 text-lg">
                  {editingFacility ? `Edit Facility: ${editingFacility.name}` : 'Add Warehouse Facility'}
                </h3>
              </div>
              <button
                onClick={() => setShowFacilityModal(false)}
                className="p-1 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveFacilitySubmit} className="space-y-3.5">
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-1">
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">Facility Code</label>
                  <input
                    type="text"
                    required
                    placeholder="MAIN-DC"
                    value={facCode}
                    onChange={(e) => setFacCode(e.target.value.toUpperCase())}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-xs font-mono uppercase text-slate-900 focus:bg-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">Facility Name</label>
                  <input
                    type="text"
                    required
                    placeholder="Main Distribution Hub"
                    value={facName}
                    onChange={(e) => setFacName(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Address / Location</label>
                <input
                  type="text"
                  placeholder="100 Logistics Way, Industrial Park"
                  value={facAddress}
                  onChange={(e) => setFacAddress(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Facility Manager</label>
                  <input
                    type="text"
                    placeholder="Operations Lead"
                    value={facManager}
                    onChange={(e) => setFacManager(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Contact Phone</label>
                  <input
                    type="text"
                    placeholder="+1 (555) 019-2834"
                    value={facPhone}
                    onChange={(e) => setFacPhone(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-xs font-mono text-slate-900 focus:bg-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Status</label>
                  <select
                    value={facStatus}
                    onChange={(e) => setFacStatus(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value="ACTIVE">ACTIVE</option>
                    <option value="MAINTENANCE">MAINTENANCE</option>
                    <option value="INACTIVE">INACTIVE</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Total Area (sq ft)</label>
                  <input
                    type="number"
                    min="1000"
                    step="5000"
                    value={facAreaSqFt}
                    onChange={(e) => setFacAreaSqFt(Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-xs font-mono text-slate-900 focus:bg-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-slate-200 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowFacilityModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingFac}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-lg shadow-xs cursor-pointer"
                >
                  {isSubmittingFac ? 'Saving...' : editingFacility ? 'Update Facility' : 'Create Facility'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create / Edit Storage Zone Modal */}
      {showZoneModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 shadow-2xl text-slate-900 space-y-4 animate-fade-in">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center space-x-2">
                <Layers className="w-5 h-5 text-emerald-600" />
                <h3 className="font-bold text-slate-900 text-lg">
                  {editingZone ? `Edit Zone: ${editingZone.title}` : 'Add Storage Zone'}
                </h3>
              </div>
              <button
                onClick={() => setShowZoneModal(false)}
                className="p-1 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveZoneSubmit} className="space-y-3.5">
              {!editingZone && (
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">Zone Code / Key</label>
                  <input
                    type="text"
                    required
                    placeholder="COLD_STORAGE or AISLE_E"
                    value={zoneCode}
                    onChange={(e) => setZoneCode(e.target.value.toUpperCase())}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-xs font-mono uppercase text-slate-900 focus:bg-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Zone Title & Display Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Cold Storage (Aisle A)"
                  value={zoneTitle}
                  onChange={(e) => setZoneTitle(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-emerald-500 font-semibold"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Temperature Range</label>
                  <input
                    type="text"
                    required
                    placeholder="2°C to 8°C Refrigerated"
                    value={zoneTemp}
                    onChange={(e) => setZoneTemp(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Assigned Aisle</label>
                  <input
                    type="text"
                    placeholder="Aisle A"
                    value={zoneAisle}
                    onChange={(e) => setZoneAisle(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-emerald-500 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Icon Emoji</label>
                  <input
                    type="text"
                    value={zoneIcon}
                    maxLength={2}
                    onChange={(e) => setZoneIcon(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-center text-sm text-slate-900 focus:bg-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Assigned Facility</label>
                  <select
                    value={zoneFacilityId}
                    onChange={(e) => setZoneFacilityId(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-emerald-500 font-medium"
                  >
                    {(facilities.length > 0 ? facilities : INITIAL_FACILITIES).map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name} ({f.code})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Zone Description</label>
                <textarea
                  rows={2}
                  placeholder="e.g. Dairy, fresh pastes, fruit concentrates requiring refrigeration"
                  value={zoneDesc}
                  onChange={(e) => setZoneDesc(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Max Capacity (kg)</label>
                <input
                  type="number"
                  min="1000"
                  step="5000"
                  value={zoneMaxCapacity}
                  onChange={(e) => setZoneMaxCapacity(Number(e.target.value))}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-xs font-mono text-slate-900 focus:bg-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="pt-3 border-t border-slate-200 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowZoneModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingZone}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg shadow-xs cursor-pointer"
                >
                  {isSubmittingZone ? 'Saving...' : editingZone ? 'Update Zone' : 'Create Storage Zone'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CSV Import Modal */}
      <CsvImportModal
        isOpen={showCsvImportModal}
        onClose={() => setShowCsvImportModal(false)}
        onSuccess={(msg) => {
          setPoSuccessToast(msg);
          onRefresh();
          setTimeout(() => setPoSuccessToast(null), 6000);
        }}
        currentUser={currentUser}
        existingSkus={skus.map((s) => s.sku)}
        existingBatches={batches.map((b) => b.batchNo)}
      />

      {/* General Delete Confirmation Modal */}
      {deleteConfirmTarget && (
        <div className="fixed inset-0 z-[9999] bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-5 bg-rose-600 text-white flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <AlertTriangle className="w-5 h-5 text-rose-200 shrink-0" />
                <h3 className="font-extrabold text-base">Confirm Deletion</h3>
              </div>
              <button
                type="button"
                onClick={() => setDeleteConfirmTarget(null)}
                className="text-rose-200 hover:text-white p-1 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-xs text-slate-600 leading-relaxed font-medium">
                Are you sure you want to permanently delete this item from the warehouse system?
              </p>

              <div className="bg-rose-50/80 border border-rose-200 rounded-xl p-3.5 space-y-1.5 text-xs">
                <p className="font-bold text-slate-900">{deleteConfirmTarget.title}</p>
                {deleteConfirmTarget.subtitle && (
                  <p className="text-xs text-slate-600 leading-relaxed">{deleteConfirmTarget.subtitle}</p>
                )}
              </div>

              <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setDeleteConfirmTarget(null)}
                  disabled={isDeletingTarget}
                  className="px-4 py-2 border border-slate-300 rounded-xl text-xs text-slate-700 font-bold hover:bg-slate-100 transition-all cursor-pointer"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  onClick={async () => {
                    setIsDeletingTarget(true);
                    try {
                      await deleteConfirmTarget.onConfirm();
                    } catch (err: any) {
                      alert(`Deletion failed: ${err.message || 'Error occurred'}`);
                    } finally {
                      setIsDeletingTarget(false);
                      setDeleteConfirmTarget(null);
                    }
                  }}
                  disabled={isDeletingTarget}
                  className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shadow-sm transition-all cursor-pointer disabled:opacity-50 flex items-center space-x-1.5"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>{isDeletingTarget ? 'Deleting...' : 'Confirm & Delete'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Outbound Loose Stock Modal */}
      <OutboundStockModal
        isOpen={showOutboundModal}
        onClose={() => setShowOutboundModal(false)}
        skus={skus}
        batches={batches}
        orders={orders}
        currentUser={currentUser}
        initialSku={outboundSku}
        initialBatchNo={outboundBatchNo}
        initialOrderId={outboundOrderId}
        onSuccess={(msg) => {
          setOutboundToast(msg || 'Stock out operation completed successfully.');
          setTimeout(() => setOutboundToast(null), 5000);
        }}
        onRefresh={onRefresh}
      />

      {/* Outbound Success Toast Notification */}
      {outboundToast && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white px-5 py-3.5 rounded-2xl shadow-2xl border border-rose-500/40 flex items-center space-x-3 animate-in slide-in-from-bottom-5">
          <div className="p-2 bg-rose-600/30 text-rose-400 rounded-xl border border-rose-400/30">
            <PackageMinus className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs font-black text-rose-300 uppercase tracking-wider">Outbound Stock Deliver Complete</div>
            <div className="text-xs text-slate-200 font-medium mt-0.5">{outboundToast}</div>
          </div>
          <button
            onClick={() => setOutboundToast(null)}
            className="p-1 text-slate-400 hover:text-white rounded-lg ml-2 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

    </div>
  );
};
