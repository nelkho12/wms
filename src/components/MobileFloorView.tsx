import React, { useState, useMemo } from 'react';
import {
  Smartphone,
  QrCode,
  Barcode,
  CheckCircle2,
  AlertTriangle,
  Boxes,
  PlusCircle,
  MapPin,
  Search,
  Volume2,
  Calendar,
  Layers,
  ArrowRight,
  ShieldCheck,
  Lock
} from 'lucide-react';
import { Batch, Location, ProductSKU, PickOrder } from '../types/wms';
import { UserProfile, UserRole, WmsPermission, hasPermission } from '../types/roles';
import { receiveInboundStock } from '../services/api';

interface MobileFloorViewProps {
  skus: ProductSKU[];
  batches: Batch[];
  locations: Location[];
  orders: PickOrder[];
  currentUser: UserProfile;
  onRefresh: () => void;
  onOpenRoleModal?: () => void;
  customRolePermissions?: Record<UserRole, WmsPermission[]>;
}

export const MobileFloorView: React.FC<MobileFloorViewProps> = ({
  skus,
  batches,
  locations,
  orders,
  currentUser,
  onRefresh,
  onOpenRoleModal,
  customRolePermissions
}) => {
  const [activeTab, setActiveTab] = useState<'scan' | 'receive' | 'pick'>('scan');
  const [scannedCode, setScannedCode] = useState('');
  const [scanResult, setScanResult] = useState<any>(null);
  const [scanError, setScanError] = useState<string | null>(null);

  const canReceive = hasPermission(currentUser.role, 'inbound:receive', customRolePermissions);
  const canPick = hasPermission(currentUser.role, 'orders:pick', customRolePermissions);

  // Mobile Inbound state
  const [mSku, setMSku] = useState(skus[0]?.sku || 'SKU-DAIRY-101');
  const [mCategory, setMCategory] = useState(skus[0]?.category || 'General Products');

  const mobileCategoriesList = useMemo(() => {
    return Array.from(new Set(skus.map((s) => s.category).filter(Boolean))).sort();
  }, [skus]);

  const handleMSkuChange = (newCode: string) => {
    setMSku(newCode);
    const matched = skus.find((s) => s.sku === newCode);
    if (matched && matched.category) {
      setMCategory(matched.category);
    }
  };
  const [mBatch, setMBatch] = useState(`MOB-B2608-${Math.floor(100 + Math.random() * 900)}`);
  const [mBbd, setMBbd] = useState('2026-09-30');
  const [mLoc, setMLoc] = useState(locations[0]?.id || 'A-01-01');
  const [mQty, setMQty] = useState(25);
  const [mFeedback, setMFeedback] = useState<string | null>(null);

  const handleSimulateScan = (codeToScan?: string) => {
    const code = codeToScan || scannedCode.trim();
    if (!code) return;

    setScanError(null);
    setScanResult(null);

    // Try matching Batch No
    const foundBatch = batches.find(
      (b) => b.batchNo.toLowerCase() === code.toLowerCase() || b.id.toLowerCase() === code.toLowerCase()
    );

    if (foundBatch) {
      const skuObj = skus.find((s) => s.sku === foundBatch.sku);
      setScanResult({
        type: 'BATCH',
        title: `Batch: ${foundBatch.batchNo}`,
        subtitle: foundBatch.itemName,
        details: [
          { label: 'SKU', val: foundBatch.sku },
          { label: 'Best Before Date (BBD)', val: foundBatch.bestBeforeDate },
          { label: 'Current Location', val: foundBatch.locationId },
          { label: 'Qty On Hand', val: `${foundBatch.quantityOnHand} units` },
          { label: 'Supplier', val: foundBatch.supplier },
          { label: 'Status', val: foundBatch.status }
        ]
      });
      return;
    }

    // Try matching Location ID
    const foundLoc = locations.find((l) => l.id.toLowerCase() === code.toLowerCase());
    if (foundLoc) {
      const bInLoc = batches.filter((b) => b.locationId === foundLoc.id);
      setScanResult({
        type: 'LOCATION',
        title: `Bin Location: ${foundLoc.id}`,
        subtitle: `Zone: ${foundLoc.zone} (Aisle ${foundLoc.aisle})`,
        details: [
          { label: 'Capacity', val: `${foundLoc.currentKg} / ${foundLoc.capacityKg} kg` },
          { label: 'Stored Batches', val: `${bInLoc.length} active lots` },
          { label: 'Stored Items', val: bInLoc.map((b) => b.itemName).join(', ') || 'Empty Bin' }
        ]
      });
      return;
    }

    // Try matching SKU
    const foundSku = skus.find(
      (s) => s.sku.toLowerCase() === code.toLowerCase() || s.barcode === code
    );
    if (foundSku) {
      const sBatches = batches.filter((b) => b.sku === foundSku.sku);
      setScanResult({
        type: 'SKU',
        title: `SKU: ${foundSku.sku}`,
        subtitle: foundSku.name,
        details: [
          { label: 'Category', val: foundSku.category },
          { label: 'Barcode', val: foundSku.barcode },
          { label: 'Storage Zone', val: foundSku.storageZone },
          { label: 'Active Lots', val: `${sBatches.length} lots in warehouse` }
        ]
      });
      return;
    }

    setScanError(`Barcode / Code '${code}' not recognized in WMS database.`);
  };

  const handleMobileInbound = async (e: React.FormEvent) => {
    e.preventDefault();
    setMFeedback(null);
    try {
      await receiveInboundStock({
        sku: mSku,
        category: mCategory,
        batchNo: mBatch,
        manufactureDate: new Date().toISOString().split('T')[0],
        bestBeforeDate: mBbd,
        supplier: 'Handheld Floor Arrival',
        locationId: mLoc,
        quantity: Number(mQty)
      });
      setMFeedback(`✅ Successfully received ${mQty} units under Batch ${mBatch}!`);
      onRefresh();
    } catch (err: any) {
      setMFeedback(`❌ Failed: ${err.message}`);
    }
  };

  return (
    <div className="max-w-md mx-auto bg-white border-2 border-slate-200 rounded-3xl overflow-hidden shadow-xl my-2">
      
      {/* Mobile Device Titlebar */}
      <div className="bg-slate-50 p-3 text-center border-b border-slate-200 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Smartphone className="w-5 h-5 text-amber-600" />
          <span className="font-mono font-black text-xs text-slate-900 uppercase tracking-wider">
            ApexWMS Handheld v3.4
          </span>
        </div>
        <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 border border-emerald-200 rounded text-[10px] font-mono font-bold">
          WiFi Connected
        </span>
      </div>

      {/* Mode Sub-Tab Navigation */}
      <div className="grid grid-cols-3 bg-slate-100 text-xs font-bold border-b border-slate-200">
        <button
          onClick={() => setActiveTab('scan')}
          className={`py-3 flex flex-col items-center cursor-pointer ${
            activeTab === 'scan' ? 'bg-amber-400 text-slate-950 font-black' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <QrCode className="w-4 h-4 mb-0.5" />
          <span>Quick Scan</span>
        </button>

        <button
          onClick={() => setActiveTab('receive')}
          className={`py-3 flex flex-col items-center cursor-pointer ${
            activeTab === 'receive' ? 'bg-amber-400 text-slate-950 font-black' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <PlusCircle className="w-4 h-4 mb-0.5" />
          <span>Floor Inbound</span>
        </button>

        <button
          onClick={() => setActiveTab('pick')}
          className={`py-3 flex flex-col items-center cursor-pointer ${
            activeTab === 'pick' ? 'bg-amber-400 text-slate-950 font-black' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Boxes className="w-4 h-4 mb-0.5" />
          <span>FEFO Pick Walk</span>
        </button>
      </div>

      {/* Main Handheld Content Area */}
      <div className="p-4 space-y-4 min-h-[420px]">
        
        {/* Tab 1: Quick Barcode Scan */}
        {activeTab === 'scan' && (
          <div className="space-y-4">
            <div className="bg-slate-50 p-4 border border-slate-200 rounded-2xl text-center space-y-3">
              <div className="w-16 h-16 bg-amber-100 border-2 border-dashed border-amber-400 rounded-xl mx-auto flex items-center justify-center text-amber-600 animate-pulse">
                <Barcode className="w-8 h-8" />
              </div>
              <p className="text-xs text-slate-700 font-semibold">
                Scan Barcode or Enter Batch No / Bin ID
              </p>

              <div className="flex space-x-2">
                <input
                  type="text"
                  placeholder="e.g. B2608-MILK-A or A-01-01"
                  value={scannedCode}
                  onChange={(e) => setScannedCode(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSimulateScan()}
                  className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 font-mono focus:outline-none focus:border-amber-500"
                />
                <button
                  onClick={() => handleSimulateScan()}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs rounded-xl shadow-xs cursor-pointer"
                >
                  Scan
                </button>
              </div>

              {/* Quick Preset Buttons */}
              <div className="pt-2 border-t border-slate-200 flex flex-wrap gap-1.5 justify-center">
                <span className="text-[10px] text-slate-500 w-full mb-1">Quick Sample Barcodes:</span>
                <button
                  onClick={() => {
                    setScannedCode('B2608-MILK-A');
                    handleSimulateScan('B2608-MILK-A');
                  }}
                  className="px-2 py-1 bg-white hover:bg-slate-100 text-[10px] font-mono text-blue-700 rounded border border-slate-200"
                >
                  B2608-MILK-A (Milk)
                </button>
                <button
                  onClick={() => {
                    setScannedCode('A-01-01');
                    handleSimulateScan('A-01-01');
                  }}
                  className="px-2 py-1 bg-white hover:bg-slate-100 text-[10px] font-mono text-emerald-700 rounded border border-slate-200"
                >
                  A-01-01 (Bin)
                </button>
                <button
                  onClick={() => {
                    setScannedCode('8901234002016');
                    handleSimulateScan('8901234002016');
                  }}
                  className="px-2 py-1 bg-white hover:bg-slate-100 text-[10px] font-mono text-purple-700 rounded border border-slate-200"
                >
                  Amoxicillin SKU
                </button>
              </div>
            </div>

            {scanError && (
              <div className="p-3 bg-rose-50 border border-rose-300 rounded-xl text-xs text-rose-800 flex items-center space-x-2">
                <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0" />
                <span>{scanError}</span>
              </div>
            )}

            {scanResult && (
              <div className="p-4 bg-slate-50 border border-amber-300 rounded-2xl space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                  <span className="text-[10px] font-bold font-mono text-amber-700 uppercase">
                    Scan Result: {scanResult.type}
                  </span>
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                </div>

                <div>
                  <h4 className="font-black text-slate-900 text-base">{scanResult.title}</h4>
                  <p className="text-xs text-slate-600 font-mono">{scanResult.subtitle}</p>
                </div>

                <div className="space-y-1.5 pt-2 border-t border-slate-200 text-xs font-mono">
                  {scanResult.details.map((d: any, idx: number) => (
                    <div key={idx} className="flex justify-between">
                      <span className="text-slate-500">{d.label}:</span>
                      <span className="text-slate-900 font-bold">{d.val}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Mobile Inbound */}
        {activeTab === 'receive' && (
          !canReceive ? (
            <div className="p-5 bg-slate-50 border border-slate-200 rounded-2xl text-center space-y-4 my-2">
              <div className="w-12 h-12 rounded-xl bg-rose-100 border border-rose-300 flex items-center justify-center mx-auto text-rose-600">
                <Lock className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h4 className="font-bold text-slate-900 text-sm">Inbound Action Restricted</h4>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Active role <strong className="text-slate-900 font-mono">{currentUser.role}</strong> lacks <code className="text-rose-700 font-mono">inbound:receive</code> permission.
                </p>
              </div>
              {onOpenRoleModal && (
                <button
                  type="button"
                  onClick={onOpenRoleModal}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-xl shadow-xs cursor-pointer w-full"
                >
                  Switch Role
                </button>
              )}
            </div>
          ) : (
          <form onSubmit={handleMobileInbound} className="space-y-3">
            <h4 className="font-bold text-xs uppercase tracking-wider text-center text-slate-500">
              Mobile Floor Inbound Entry
            </h4>

            {mFeedback && (
              <div className="p-2.5 rounded-lg text-xs font-semibold bg-amber-50 border border-amber-200 text-amber-900">
                {mFeedback}
              </div>
            )}

            <div className="space-y-2.5">
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">1. Choose SKU Product ({skus.length} catalog items)</label>
                <select
                  value={mSku}
                  onChange={(e) => handleMSkuChange(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-xl p-2.5 text-xs text-slate-900 font-medium focus:ring-2 focus:ring-blue-500"
                >
                  {skus.map((s) => (
                    <option key={s.sku} value={s.sku}>
                      {s.name} ({s.sku})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">2. Choose Product Category</label>
                <select
                  value={mCategory}
                  onChange={(e) => setMCategory(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-xl p-2.5 text-xs font-medium text-slate-900 focus:ring-2 focus:ring-blue-500"
                >
                  {mobileCategoriesList.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] text-slate-600 mb-1">Batch #</label>
                <input
                  type="text"
                  required
                  value={mBatch}
                  onChange={(e) => setMBatch(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-xl p-2 text-xs text-slate-900 font-mono"
                />
              </div>

              <div>
                <label className="block text-[11px] text-slate-600 mb-1">Best Before (BBD)</label>
                <input
                  type="date"
                  required
                  value={mBbd}
                  onChange={(e) => setMBbd(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-xl p-2 text-xs text-slate-900 font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] text-slate-600 mb-1">Putaway Bin</label>
                <select
                  value={mLoc}
                  onChange={(e) => setMLoc(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-xl p-2 text-xs text-slate-900 font-mono"
                >
                  {locations.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.id}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] text-slate-600 mb-1">Quantity</label>
                <input
                  type="number"
                  min="1"
                  required
                  value={mQty}
                  onChange={(e) => setMQty(Number(e.target.value))}
                  className="w-full bg-white border border-slate-300 rounded-xl p-2 text-xs text-slate-900 font-mono"
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs rounded-xl shadow-xs cursor-pointer mt-2"
            >
              Confirm Inbound Pallet Scan
            </button>
          </form>
          )
        )}

        {/* Tab 3: FEFO Pick Walk Mobile Mode */}
        {activeTab === 'pick' && (
          !canPick ? (
            <div className="p-5 bg-slate-50 border border-slate-200 rounded-2xl text-center space-y-4 my-2">
              <div className="w-12 h-12 rounded-xl bg-rose-100 border border-rose-300 flex items-center justify-center mx-auto text-rose-600">
                <Lock className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h4 className="font-bold text-slate-900 text-sm">Pick Walk Restricted</h4>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Active role <strong className="text-slate-900 font-mono">{currentUser.role}</strong> lacks <code className="text-rose-700 font-mono">orders:pick</code> permission.
                </p>
              </div>
              {onOpenRoleModal && (
                <button
                  type="button"
                  onClick={onOpenRoleModal}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-xl shadow-xs cursor-pointer w-full"
                >
                  Switch Role
                </button>
              )}
            </div>
          ) : (
          <div className="space-y-3">
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-600">
                <span>Pending Pick Orders</span>
                <span className="font-mono text-amber-700 font-bold">{orders.length} Ready</span>
              </div>

              {orders.map((ord) => (
                <div
                  key={ord.id}
                  className="p-3 bg-white border border-slate-200 rounded-xl space-y-2"
                >
                  <div className="flex items-center justify-between font-mono font-bold text-xs text-slate-900">
                    <span>{ord.id}</span>
                    <span className="px-1.5 py-0.5 bg-blue-100 text-blue-800 border border-blue-200 rounded text-[10px]">
                      {ord.priority}
                    </span>
                  </div>
                  <div className="text-xs text-slate-800 font-semibold">{ord.customerName}</div>
                  <div className="text-[11px] text-slate-500 font-mono">
                    Items: {ord.items.map((i) => `${i.requestedQty}x ${i.itemName.slice(0, 15)}`).join(', ')}
                  </div>
                </div>
              ))}
            </div>
          </div>
          )
        )}

      </div>

      {/* Footer bar */}
      <div className="bg-slate-50 p-2 border-t border-slate-200 text-center text-[10px] text-slate-500">
        Handheld Mode Active • Scan Gun Connected
      </div>

    </div>
  );
};
