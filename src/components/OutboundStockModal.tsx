import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  PackageMinus,
  Truck,
  FileText,
  AlertCircle,
  CheckCircle2,
  Calendar,
  Layers,
  Boxes,
  MapPin,
  User,
  ShoppingBag,
  Info,
  Clock,
  Sparkles,
  Search
} from 'lucide-react';
import { ProductSKU, Batch, PickOrder } from '../types/wms';
import { UserProfile } from '../types/roles';
import { outboundStock } from '../services/api';

interface OutboundStockModalProps {
  isOpen: boolean;
  onClose: () => void;
  skus: ProductSKU[];
  batches: Batch[];
  orders: PickOrder[];
  currentUser: UserProfile;
  onSuccess: (message?: string) => void;
  onRefresh?: () => Promise<any> | void;
  initialSku?: string;
  initialBatchNo?: string;
  initialOrderId?: string;
}

const OUTBOUND_PURPOSES = [
  { id: 'CUSTOMER_LOOSE_REQ', label: 'Customer Loose Request / Top-up', group: 'Customer' },
  { id: 'SO_FULFILLMENT', label: 'Sales Order Partial / Loose Fulfillment', group: 'Customer' },
  { id: 'SAMPLE_TASTING', label: 'Barista Sample & Tasting Request', group: 'Commercial' },
  { id: 'QA_LAB_TEST', label: 'QA / Lab Quality Inspection & Retest', group: 'Compliance' },
  { id: 'EXHIBITION_EVENT', label: 'Exhibition / Trade Show / Event Marketing', group: 'Marketing' },
  { id: 'DAMAGED_SCRAP', label: 'Damaged / Spoilage / Expired Scrapped', group: 'Disposal' },
  { id: 'INTERNAL_STAFF', label: 'Internal Transfer / Staff Training Issue', group: 'Internal' },
  { id: 'WARRANTY_REPLACE', label: 'Customer Warranty / Replacement Item', group: 'Customer' },
  { id: 'CUSTOM', label: 'Other Custom Purpose (Specify in Remark)', group: 'General' }
];

export const OutboundStockModal: React.FC<OutboundStockModalProps> = ({
  isOpen,
  onClose,
  skus,
  batches,
  orders,
  currentUser,
  onSuccess,
  onRefresh,
  initialSku,
  initialBatchNo,
  initialOrderId
}) => {
  // Mode: Link to existing SO vs Ad-hoc loose request
  const [outboundMode, setOutboundMode] = useState<'LINKED_SO' | 'LOOSE_REQ'>(
    initialOrderId ? 'LINKED_SO' : 'LOOSE_REQ'
  );

  // Form State
  const [selectedOrderId, setSelectedOrderId] = useState<string>(initialOrderId || '');
  const [selectedSku, setSelectedSku] = useState<string>(initialSku || skus[0]?.sku || '');
  const [selectedBatchNo, setSelectedBatchNo] = useState<string>(initialBatchNo || 'AUTO_FEFO');
  const [quantity, setQuantity] = useState<number>(1);
  const [outboundPurpose, setOutboundPurpose] = useState<string>(
    initialOrderId ? 'Sales Order Partial / Loose Fulfillment' : 'Customer Loose Request / Top-up'
  );
  const [destination, setDestination] = useState<string>('Outbound Express Bay 1');
  const [remark, setRemark] = useState<string>('');
  const [createSalesOrderRecord, setCreateSalesOrderRecord] = useState<boolean>(true);
  const [looseCustomerName, setLooseCustomerName] = useState<string>('');
  const [orderSearchTerm, setOrderSearchTerm] = useState<string>('');

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Reset or initialize on modal open
  useEffect(() => {
    if (isOpen) {
      if (initialOrderId) {
        setOutboundMode('LINKED_SO');
        setSelectedOrderId(initialOrderId);
      }
      if (initialSku) {
        setSelectedSku(initialSku);
      }
      if (initialBatchNo) {
        setSelectedBatchNo(initialBatchNo);
      }
      setErrorMsg(null);
    }
  }, [isOpen, initialOrderId, initialSku, initialBatchNo]);

  // When order changes, synchronize SKU if order has specific items
  useEffect(() => {
    if (outboundMode === 'LINKED_SO' && selectedOrderId) {
      const order = orders.find((o) => o.id === selectedOrderId || o.salesOrderNo === selectedOrderId);
      if (order && order.items && order.items.length > 0) {
        // Pick first unfulfilled item or first item
        const unfulfilledItem = order.items.find((i) => (i.outstandingQty || 0) > 0) || order.items[0];
        if (unfulfilledItem) {
          setSelectedSku(unfulfilledItem.sku);
          if (unfulfilledItem.outstandingQty && unfulfilledItem.outstandingQty > 0) {
            setQuantity(Math.min(unfulfilledItem.outstandingQty, 50));
          }
        }
      }
    }
  }, [selectedOrderId, outboundMode, orders]);

  // Available batches for selected SKU
  const availableBatches = useMemo(() => {
    return batches
      .filter((b) => b.sku === selectedSku && b.status !== 'QUARANTINED' && b.quantityOnHand > 0)
      .sort((a, b) => new Date(a.bestBeforeDate).getTime() - new Date(b.bestBeforeDate).getTime());
  }, [batches, selectedSku]);

  // Selected SKU Object
  const currentSkuObj = useMemo(() => {
    return skus.find((s) => s.sku === selectedSku) || skus[0];
  }, [skus, selectedSku]);

  // Target Batch Object (if not auto FEFO)
  const targetBatchObj = useMemo(() => {
    if (selectedBatchNo === 'AUTO_FEFO') {
      return availableBatches[0] || null;
    }
    return availableBatches.find((b) => b.batchNo === selectedBatchNo) || availableBatches[0] || null;
  }, [availableBatches, selectedBatchNo]);

  // Target Sales Order Object
  const currentOrderObj = useMemo(() => {
    if (outboundMode !== 'LINKED_SO' || !selectedOrderId) return null;
    return orders.find((o) => o.id === selectedOrderId || o.salesOrderNo === selectedOrderId) || null;
  }, [outboundMode, selectedOrderId, orders]);

  // Filtered Orders for dropdown/search
  const filteredOrders = useMemo(() => {
    return orders.filter((o) => {
      const term = orderSearchTerm.toLowerCase();
      const matchNo = (o.salesOrderNo || o.id).toLowerCase().includes(term);
      const matchCust = (o.customerName || '').toLowerCase().includes(term);
      const matchPo = (o.poNumber || '').toLowerCase().includes(term);
      return matchNo || matchCust || matchPo;
    });
  }, [orders, orderSearchTerm]);

  // Max available in chosen batch
  const maxAvailable = targetBatchObj ? targetBatchObj.quantityOnHand : 0;

  // Handle Form Submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!selectedSku) {
      setErrorMsg('Please select a SKU.');
      return;
    }

    if (!quantity || quantity <= 0) {
      setErrorMsg('Quantity must be greater than 0.');
      return;
    }

    if (quantity > maxAvailable) {
      setErrorMsg(`Requested quantity (${quantity}) exceeds batch available stock (${maxAvailable}).`);
      return;
    }

    if (!remark.trim()) {
      setErrorMsg('Please provide a remark / purpose note for audit traceability.');
      return;
    }

    if (outboundMode === 'LINKED_SO' && !selectedOrderId) {
      setErrorMsg('Please select a Sales Order to link this stock out deduction.');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        sku: selectedSku,
        batchNo: selectedBatchNo === 'AUTO_FEFO' ? undefined : selectedBatchNo,
        quantity: Number(quantity),
        outboundPurpose,
        remark: remark.trim(),
        operator: `${currentUser.name} (${currentUser.role})`,
        destination,
        salesOrderId: outboundMode === 'LINKED_SO' ? selectedOrderId : undefined,
        createSalesOrderRecord: outboundMode === 'LOOSE_REQ' ? createSalesOrderRecord : false,
        customerName: outboundMode === 'LOOSE_REQ' && looseCustomerName.trim() ? looseCustomerName.trim() : undefined
      };

      const result = await outboundStock(payload);

      if (onRefresh) {
        await onRefresh();
      }

      onSuccess(
        result.message ||
          `Successfully outbounded ${quantity} CTN of ${currentSkuObj?.name || selectedSku} (${outboundPurpose}).`
      );
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to process outbound stock deduction.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-3xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 my-8">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-rose-900 via-slate-900 to-rose-950 px-6 py-5 text-white flex items-center justify-between border-b border-rose-800/40">
          <div className="flex items-center space-x-3.5">
            <div className="p-3 bg-rose-600/30 border border-rose-400/30 rounded-2xl text-rose-300 shadow-inner">
              <PackageMinus className="w-6 h-6 text-rose-300" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-lg font-black tracking-tight text-white">Outbound Stock Deliver</h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-rose-500/30 text-rose-200 border border-rose-400/40">
                  Stock Out & SO Sync
                </span>
              </div>
              <p className="text-xs text-rose-200/80 mt-0.5">
                Deduct physical cartons from FEFO lots with mandatory purpose & audit remarks linked to Sales Orders.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-xl transition-all cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5 max-h-[80vh] overflow-y-auto">
          
          {errorMsg && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl text-rose-800 text-xs flex items-center space-x-2.5">
              <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
              <span className="font-semibold">{errorMsg}</span>
            </div>
          )}

          {/* Mode Selector Tabs */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              1. Outbound Workflow Mode
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setOutboundMode('LOOSE_REQ')}
                className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer flex items-start space-x-3 ${
                  outboundMode === 'LOOSE_REQ'
                    ? 'bg-rose-50/80 border-rose-400 ring-2 ring-rose-500/20 shadow-xs'
                    : 'bg-slate-50 hover:bg-slate-100 border-slate-200'
                }`}
              >
                <div className={`p-2 rounded-xl shrink-0 ${
                  outboundMode === 'LOOSE_REQ' ? 'bg-rose-600 text-white' : 'bg-slate-200 text-slate-600'
                }`}>
                  <PackageMinus className="w-4 h-4" />
                </div>
                <div>
                  <div className="font-extrabold text-xs text-slate-900 flex items-center space-x-1.5">
                    <span>Ad-Hoc / Loose Request</span>
                    {outboundMode === 'LOOSE_REQ' && <CheckCircle2 className="w-3.5 h-3.5 text-rose-600" />}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    Sample packs, QA lab tests, showroom, damaged scrap, or loose urgent top-ups.
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setOutboundMode('LINKED_SO')}
                className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer flex items-start space-x-3 ${
                  outboundMode === 'LINKED_SO'
                    ? 'bg-indigo-50/80 border-indigo-400 ring-2 ring-indigo-500/20 shadow-xs'
                    : 'bg-slate-50 hover:bg-slate-100 border-slate-200'
                }`}
              >
                <div className={`p-2 rounded-xl shrink-0 ${
                  outboundMode === 'LINKED_SO' ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-600'
                }`}>
                  <ShoppingBag className="w-4 h-4" />
                </div>
                <div>
                  <div className="font-extrabold text-xs text-slate-900 flex items-center space-x-1.5">
                    <span>Link to Existing Sales Order</span>
                    {outboundMode === 'LINKED_SO' && <CheckCircle2 className="w-3.5 h-3.5 text-indigo-600" />}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    Deduct stock and update fulfilled cartons on an active customer Sales Order.
                  </div>
                </div>
              </button>
            </div>
          </div>

          {/* Conditional: Sales Order Selection */}
          {outboundMode === 'LINKED_SO' && (
            <div className="p-4 bg-indigo-50/60 border border-indigo-200 rounded-2xl space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-extrabold text-indigo-950 uppercase tracking-wider flex items-center space-x-1.5">
                  <ShoppingBag className="w-4 h-4 text-indigo-600" />
                  <span>Select Target Sales Order</span>
                </label>
                <span className="text-[11px] text-indigo-700 font-medium">
                  {orders.length} orders in system
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">Sales Order</label>
                  <select
                    value={selectedOrderId}
                    onChange={(e) => setSelectedOrderId(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-indigo-300 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  >
                    <option value="">-- Choose Sales Order --</option>
                    {filteredOrders.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.salesOrderNo || o.id} - {o.customerName} ({o.fulfillmentStatus || o.status})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">Search Order / Customer</label>
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="Filter SO#, Customer, PO#..."
                      value={orderSearchTerm}
                      onChange={(e) => setOrderSearchTerm(e.target.value)}
                      className="w-full pl-8 pr-3 py-2 bg-white border border-indigo-300 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    />
                  </div>
                </div>
              </div>

              {currentOrderObj && (
                <div className="p-3 bg-white border border-indigo-200/80 rounded-xl flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="space-y-0.5">
                    <div className="font-bold text-slate-900 flex items-center space-x-2">
                      <span>{currentOrderObj.customerName}</span>
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-indigo-100 text-indigo-800">
                        {currentOrderObj.salesOrderNo}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500 font-sans">
                      PO: {currentOrderObj.poNumber || 'N/A'} | Delivery: {currentOrderObj.destinationZone || 'Bay 1'}
                    </div>
                  </div>
                  <div className="flex items-center space-x-3 text-right">
                    <div>
                      <div className="text-[10px] uppercase font-bold text-slate-500">Ordered</div>
                      <div className="font-extrabold text-slate-800">{currentOrderObj.totalOrderCtn} CTN</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase font-bold text-emerald-600">Fulfilled</div>
                      <div className="font-extrabold text-emerald-700">{currentOrderObj.totalFulfilledCtn || 0} CTN</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase font-bold text-amber-600">Outstanding</div>
                      <div className="font-extrabold text-amber-700">{currentOrderObj.totalOutstandingCtn ?? currentOrderObj.totalOrderCtn} CTN</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Conditional: Loose Request Customer name */}
          {outboundMode === 'LOOSE_REQ' && (
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-extrabold text-slate-800 uppercase tracking-wider flex items-center space-x-1.5">
                  <FileText className="w-4 h-4 text-slate-600" />
                  <span>Loose Request Recipient / Customer</span>
                </label>
                <label className="flex items-center space-x-1.5 text-xs text-slate-600 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={createSalesOrderRecord}
                    onChange={(e) => setCreateSalesOrderRecord(e.target.checked)}
                    className="w-3.5 h-3.5 text-rose-600 rounded border-slate-300 focus:ring-rose-500"
                  />
                  <span className="font-medium">Auto-record in Sales Orders ledger</span>
                </label>
              </div>

              <div>
                <input
                  type="text"
                  placeholder="e.g. Starbucks Malaysia (Sample Demo), QA Testing Lab, Barista Training Academy..."
                  value={looseCustomerName}
                  onChange={(e) => setLooseCustomerName(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-rose-500/20"
                />
              </div>
            </div>
          )}

          {/* SKU & Lot Selection */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            {/* SKU Selection */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center space-x-1.5">
                <Layers className="w-3.5 h-3.5 text-slate-500" />
                <span>Product SKU *</span>
              </label>
              <select
                value={selectedSku}
                onChange={(e) => {
                  setSelectedSku(e.target.value);
                  setSelectedBatchNo('AUTO_FEFO');
                }}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:bg-white focus:ring-2 focus:ring-rose-500/20"
              >
                {skus.map((s) => (
                  <option key={s.sku} value={s.sku}>
                    {s.sku} - {s.name} (Stock: {s.exactQty ?? s.currentQty ?? 0} {s.unit})
                  </option>
                ))}
              </select>
              {currentSkuObj && (
                <div className="text-[11px] text-slate-500 flex items-center justify-between px-1">
                  <span>Category: <strong>{currentSkuObj.category}</strong></span>
                  <span>Packaging: <strong>{currentSkuObj.packaging || currentSkuObj.unit}</strong></span>
                </div>
              )}
            </div>

            {/* Batch Lot Selection */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center justify-between">
                <span className="flex items-center space-x-1.5">
                  <Boxes className="w-3.5 h-3.5 text-slate-500" />
                  <span>Batch Lot (FEFO Pick) *</span>
                </span>
                <span className="text-[10px] text-emerald-600 font-semibold lowercase">
                  {availableBatches.length} active lots
                </span>
              </label>
              <select
                value={selectedBatchNo}
                onChange={(e) => setSelectedBatchNo(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:bg-white focus:ring-2 focus:ring-rose-500/20"
              >
                <option value="AUTO_FEFO">
                  ⭐ Auto FEFO (Pick Earliest Expiry Lot)
                </option>
                {availableBatches.map((b) => (
                  <option key={b.batchNo} value={b.batchNo}>
                    Lot {b.batchNo} | Exp: {b.bestBeforeDate} | Qty: {b.quantityOnHand} @ {b.locationId}
                  </option>
                ))}
              </select>
              {targetBatchObj && (
                <div className="text-[11px] text-slate-600 flex items-center justify-between px-1">
                  <span>Loc: <strong className="text-slate-800">{targetBatchObj.locationId}</strong></span>
                  <span>BBD: <strong className="text-amber-700">{targetBatchObj.bestBeforeDate}</strong></span>
                  <span>Avail: <strong className="text-emerald-700">{targetBatchObj.quantityOnHand} CTN</strong></span>
                </div>
              )}
            </div>
          </div>

          {/* Quantity & Purpose & Destination */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            
            {/* Quantity */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center justify-between">
                <span>Deduct Qty (CTN) *</span>
                <span className="text-[10px] text-slate-500">Max: {maxAvailable}</span>
              </label>
              <div className="flex items-center space-x-1.5">
                <input
                  type="number"
                  min="1"
                  max={maxAvailable || 1}
                  value={quantity}
                  onChange={(e) => setQuantity(Math.max(1, Number(e.target.value)))}
                  className="w-full px-3 py-2.5 bg-white border border-slate-300 rounded-xl text-sm font-extrabold text-slate-900 focus:outline-none focus:ring-2 focus:ring-rose-500/20 text-center"
                />
              </div>
              <div className="flex items-center space-x-1 pt-1">
                {[1, 5, 10, 25].map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => setQuantity(Math.min(maxAvailable, q))}
                    className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-[10px] font-bold transition-all cursor-pointer"
                  >
                    +{q}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setQuantity(maxAvailable)}
                  className="px-2 py-0.5 bg-rose-100 hover:bg-rose-200 text-rose-800 rounded text-[10px] font-bold transition-all cursor-pointer"
                >
                  Max
                </button>
              </div>
            </div>

            {/* Outbound Purpose */}
            <div className="space-y-1.5 sm:col-span-2">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Outbound Purpose / Reason *
              </label>
              <select
                value={outboundPurpose}
                onChange={(e) => setOutboundPurpose(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:bg-white focus:ring-2 focus:ring-rose-500/20"
              >
                {OUTBOUND_PURPOSES.map((p) => (
                  <option key={p.id} value={p.label}>
                    [{p.group}] {p.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Destination Staging Area */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center space-x-1.5">
              <MapPin className="w-3.5 h-3.5 text-slate-500" />
              <span>Outbound Staging / Dispatch Destination</span>
            </label>
            <input
              type="text"
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              placeholder="e.g. Outbound Express Bay 1, QA Inspection Bench, Dispatch Staging..."
              className="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none focus:bg-white focus:ring-2 focus:ring-rose-500/20"
            />
          </div>

          {/* Mandatory Remark / Purpose Notes */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-extrabold text-slate-900 uppercase tracking-wider flex items-center space-x-1.5">
                <FileText className="w-4 h-4 text-rose-600" />
                <span>Remark & Purpose Notes (Mandatory for Traceability) *</span>
              </label>
              <span className="text-[10px] text-slate-500 font-medium">Logged in Audit Ledger</span>
            </div>
            <textarea
              required
              rows={3}
              value={remark}
              onChange={(e) => setRemark(e.target.value)}
              placeholder="Please enter the exact purpose or request details (e.g. 'Requested by barista training team for regional workshop sample batch', 'Customer requested urgent top-up 5 cartons under PO #402', etc.)..."
              className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-2xl text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 transition-all font-sans"
            />
          </div>

          {/* Impact Summary Banner */}
          <div className="p-4 bg-slate-900 text-white rounded-2xl border border-slate-800 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400 flex items-center space-x-1.5">
                <Info className="w-3.5 h-3.5 text-rose-400" />
                <span>Inventory Deduction Preview</span>
              </span>
              <span className="text-slate-300 text-[11px] font-mono">
                Operator: <strong className="text-white">{currentUser.name}</strong> ({currentUser.role})
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2 pt-1 border-t border-slate-800 text-center">
              <div>
                <div className="text-[10px] text-slate-400 uppercase font-semibold">Lot On-Hand</div>
                <div className="text-sm font-extrabold text-slate-200">{maxAvailable} CTN</div>
              </div>
              <div className="text-rose-400">
                <div className="text-[10px] text-rose-300 uppercase font-semibold">Deducting</div>
                <div className="text-sm font-extrabold text-rose-400">-{quantity} CTN</div>
              </div>
              <div>
                <div className="text-[10px] text-slate-400 uppercase font-semibold">Remaining On-Hand</div>
                <div className="text-sm font-extrabold text-emerald-400">{Math.max(0, maxAvailable - quantity)} CTN</div>
              </div>
            </div>
          </div>

          {/* Footer Buttons */}
          <div className="flex items-center justify-end space-x-3 pt-2 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all cursor-pointer"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={isSubmitting || maxAvailable <= 0}
              className="px-6 py-2.5 bg-gradient-to-r from-rose-600 via-rose-700 to-rose-800 hover:from-rose-700 hover:to-rose-900 text-white rounded-xl text-xs font-black shadow-md hover:shadow-lg transition-all flex items-center space-x-2 cursor-pointer disabled:opacity-50"
            >
              <PackageMinus className="w-4 h-4" />
              <span>{isSubmitting ? 'Processing Delivery...' : 'Confirm Outbound Delivery'}</span>
            </button>
          </div>

        </form>
      </div>
    </div>
  );
};
