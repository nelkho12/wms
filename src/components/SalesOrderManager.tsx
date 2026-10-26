import React, { useState, useEffect } from 'react';
import {
  ShoppingBag,
  Plus,
  Search,
  CheckCircle2,
  AlertCircle,
  Clock,
  Layers,
  Box,
  Truck,
  RefreshCw,
  Trash2,
  Save,
  Sparkles,
  Zap,
  ArrowUpRight,
  Filter,
  FileText,
  User,
  Calendar,
  Check,
  X,
  Users,
  Building,
  Phone,
  Mail,
  MapPin,
  CreditCard,
  PlusCircle,
  Briefcase,
  Pencil,
  AlertTriangle,
  Lock,
  Unlock,
  PackageMinus
} from 'lucide-react';
import { ProductSKU, PickOrder, OrderItem, Batch, AuditCategory, CustomerProfile } from '../types/wms';
import { UserProfile, UserRole, WmsPermission, hasPermission } from '../types/roles';
import { OutboundStockModal } from './OutboundStockModal';
import {
  createSalesOrder,
  updateSalesOrderAllocation,
  autoAllocateSalesOrder,
  deleteSalesOrder,
  lockSalesOrder,
  fetchCustomers,
  createCustomerProfile,
  updateCustomerProfile,
  deleteCustomerProfile
} from '../services/api';

interface SalesOrderManagerProps {
  orders: PickOrder[];
  skus: ProductSKU[];
  batches: Batch[];
  currentUser: UserProfile;
  onRefresh: () => void;
  onLogAuditActivity: (
    actionCategory: AuditCategory,
    actionType: string,
    targetEntity: string,
    details: string,
    severity?: 'INFO' | 'WARNING' | 'CRITICAL'
  ) => void;
  onOpenRoleModal?: () => void;
  customRolePermissions?: Record<UserRole, WmsPermission[]>;
}

export const SalesOrderManager: React.FC<SalesOrderManagerProps> = ({
  orders,
  skus,
  batches,
  currentUser,
  onRefresh,
  onLogAuditActivity,
  onOpenRoleModal,
  customRolePermissions
}) => {
  const canEditOrders = hasPermission(currentUser.role, 'orders:manage', customRolePermissions);

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(orders[0]?.id || null);

  // Editable state for allocation adjustments
  const [editingAllocations, setEditingAllocations] = useState<Record<string, Record<string, { orderQty: number; allocQty: number; remark: string }>>>({});
  const [savingOrderId, setSavingOrderId] = useState<string | null>(null);

  // New Sales Order Modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState('ZUS Coffee Malaysia HQ');
  const [newPoNumber, setNewPoNumber] = useState(`PO-ZUS-${Math.floor(1000 + Math.random() * 9000)}`);
  const [newSoNumber, setNewSoNumber] = useState(`SO-2026-${Math.floor(8000 + Math.random() * 1000)}`);
  const [newDeliveryDate, setNewDeliveryDate] = useState('2026-08-10');
  const [newPriority, setNewPriority] = useState<'NORMAL' | 'HIGH' | 'URGENT'>('URGENT');
  const [newRemark, setNewRemark] = useState('');
  const [newItemRows, setNewItemRows] = useState<Array<{ sku: string; orderQty: number; allocQty: number; remark: string }>>([
    { sku: 'ML221101', orderQty: 50, allocQty: 50, remark: 'Initial order allocation' }
  ]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  const handleSyncWms = async () => {
    setIsSyncing(true);
    try {
      if (onRefresh) {
        await onRefresh();
      }
    } catch (err) {
      console.error('Failed to sync WMS:', err);
    } finally {
      setTimeout(() => setIsSyncing(false), 500);
    }
  };

  // Customer Management State
  const [customers, setCustomers] = useState<CustomerProfile[]>([]);
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [showCreateCustomerModal, setShowCreateCustomerModal] = useState(false);
  const [customerSearchTerm, setCustomerSearchTerm] = useState('');

  // Outbound Loose Stock State
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

  // New Customer Profile Form State
  const [custCompanyName, setCustCompanyName] = useState('');
  const [custCode, setCustCode] = useState('');
  const [custContactPerson, setCustContactPerson] = useState('');
  const [custEmail, setCustEmail] = useState('');
  const [custPhone, setCustPhone] = useState('');
  const [custAddress, setCustAddress] = useState('');
  const [custCreditLimit, setCustCreditLimit] = useState(150000);
  const [custPaymentTerms, setCustPaymentTerms] = useState('NET 30');
  const [custPreferredZone, setCustPreferredZone] = useState('Outbound Express Bay 1');
  const [custNotes, setCustNotes] = useState('');
  const [isSavingCust, setIsSavingCust] = useState(false);

  // Edit Customer Profile Form State
  const [editingCustomer, setEditingCustomer] = useState<CustomerProfile | null>(null);
  const [showEditCustomerModal, setShowEditCustomerModal] = useState(false);
  const [editCompanyName, setEditCompanyName] = useState('');
  const [editCode, setEditCode] = useState('');
  const [editContactPerson, setEditContactPerson] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editCreditLimit, setEditCreditLimit] = useState(150000);
  const [editPaymentTerms, setEditPaymentTerms] = useState('NET 30');
  const [editPreferredZone, setEditPreferredZone] = useState('Outbound Express Bay 1');
  const [editStatus, setEditStatus] = useState<'ACTIVE' | 'INACTIVE'>('ACTIVE');
  const [editNotes, setEditNotes] = useState('');
  const [isUpdatingCust, setIsUpdatingCust] = useState(false);

  // Delete Sales Order Confirmation Modal State
  const [orderToDelete, setOrderToDelete] = useState<PickOrder | null>(null);
  const [showDeleteOrderModal, setShowDeleteOrderModal] = useState<boolean>(false);
  const [isDeletingOrder, setIsDeletingOrder] = useState<boolean>(false);

  // Delete Customer Confirmation Modal State
  const [customerToDelete, setCustomerToDelete] = useState<CustomerProfile | null>(null);
  const [showDeleteCustomerModal, setShowDeleteCustomerModal] = useState<boolean>(false);
  const [isDeletingCustomer, setIsDeletingCustomer] = useState<boolean>(false);

  // Load Customer Directory
  const loadCustomersData = async () => {
    try {
      const data = await fetchCustomers();
      if (data && data.length > 0) {
        setCustomers(data);
      }
    } catch (err) {
      console.warn('Failed to load customers:', err);
    }
  };

  useEffect(() => {
    loadCustomersData();
  }, []);

  const handleCreateCustomerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!custCompanyName.trim()) {
      alert('Company Name is required.');
      return;
    }
    setIsSavingCust(true);
    try {
      const created = await createCustomerProfile({
        companyName: custCompanyName,
        customerCode: custCode,
        contactPerson: custContactPerson,
        email: custEmail,
        phone: custPhone,
        address: custAddress,
        creditLimit: custCreditLimit,
        paymentTerms: custPaymentTerms,
        preferredZone: custPreferredZone,
        notes: custNotes
      });

      onLogAuditActivity(
        'INVENTORY',
        'CUSTOMER_CREATED',
        created.customerCode,
        `Registered new customer profile: ${created.companyName}`,
        'INFO'
      );

      await loadCustomersData();

      // Auto-select newly created customer in Sales Order form
      setNewCustomerName(created.companyName);
      if (created.customerCode) {
        setNewPoNumber(`PO-${created.customerCode.replace(/^CUST-/, '')}-${Math.floor(1000 + Math.random() * 9000)}`);
      }

      setShowCreateCustomerModal(false);
      // Reset customer form
      setCustCompanyName('');
      setCustCode('');
      setCustContactPerson('');
      setCustEmail('');
      setCustPhone('');
      setCustAddress('');
      setCustNotes('');
    } catch (err: any) {
      alert(`Error creating customer profile: ${err.message || 'Failed'}`);
    } finally {
      setIsSavingCust(false);
    }
  };

  const handleStartEditCustomer = (cust: CustomerProfile) => {
    setEditingCustomer(cust);
    setEditCompanyName(cust.companyName || '');
    setEditCode(cust.customerCode || '');
    setEditContactPerson(cust.contactPerson || '');
    setEditEmail(cust.email || '');
    setEditPhone(cust.phone || '');
    setEditAddress(cust.address || '');
    setEditCreditLimit(cust.creditLimit || 100000);
    setEditPaymentTerms(cust.paymentTerms || 'NET 30');
    setEditPreferredZone(cust.preferredZone || 'Outbound Express Bay 1');
    setEditStatus(cust.status || 'ACTIVE');
    setEditNotes(cust.notes || '');
    setShowEditCustomerModal(true);
  };

  const handleUpdateCustomerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCustomer) return;
    if (!editCompanyName.trim()) {
      alert('Company Name is required.');
      return;
    }
    setIsUpdatingCust(true);
    try {
      const updated = await updateCustomerProfile(editingCustomer.id, {
        companyName: editCompanyName,
        customerCode: editCode,
        contactPerson: editContactPerson,
        email: editEmail,
        phone: editPhone,
        address: editAddress,
        creditLimit: editCreditLimit,
        paymentTerms: editPaymentTerms,
        preferredZone: editPreferredZone,
        status: editStatus,
        notes: editNotes
      });

      onLogAuditActivity(
        'INVENTORY',
        'CUSTOMER_UPDATED',
        updated.customerCode || editingCustomer.id,
        `Updated customer profile: ${updated.companyName}`,
        'INFO'
      );

      await loadCustomersData();
      setShowEditCustomerModal(false);
      setEditingCustomer(null);
    } catch (err: any) {
      alert(`Error updating customer profile: ${err.message || 'Failed'}`);
    } finally {
      setIsUpdatingCust(false);
    }
  };

  const handleDeleteCustomer = (cust: CustomerProfile) => {
    setCustomerToDelete(cust);
    setShowDeleteCustomerModal(true);
  };

  const handleConfirmDeleteCustomer = async () => {
    if (!customerToDelete) return;
    setIsDeletingCustomer(true);
    try {
      await deleteCustomerProfile(customerToDelete.id);
      onLogAuditActivity(
        'INVENTORY',
        'CUSTOMER_DELETED',
        customerToDelete.customerCode || customerToDelete.id,
        `Deleted customer profile: ${customerToDelete.companyName}`,
        'WARNING'
      );
      await loadCustomersData();
      setShowDeleteCustomerModal(false);
      setCustomerToDelete(null);
    } catch (err: any) {
      alert(`Error deleting customer profile: ${err.message || 'Failed'}`);
    } finally {
      setIsDeletingCustomer(false);
    }
  };

  // Calculate high-level KPIs
  const totalOrdersCount = orders.length;
  const totalOrderCtn = orders.reduce((sum, o) => sum + (o.totalOrderCtn || o.items.reduce((iSum, i) => iSum + (i.orderQtyCtn || i.requestedQty || 0), 0)), 0);
  const totalAllocatedCtn = orders.reduce((sum, o) => sum + (o.totalAllocatedCtn || o.items.reduce((iSum, i) => iSum + (i.allocateQty || 0), 0)), 0);
  const totalFulfilledCtn = orders.reduce((sum, o) => sum + (o.totalFulfilledCtn || o.items.reduce((iSum, i) => iSum + (i.fulfillmentQty || i.pickedQty || 0), 0)), 0);
  const totalOutstandingCtn = orders.reduce((sum, o) => sum + (o.totalOutstandingCtn || Math.max(0, o.totalOrderCtn - o.totalFulfilledCtn)), 0);
  const totalReservedInCatalog = skus.reduce((sum, s) => sum + (s.reserved || 0), 0);

  // Filter orders
  const filteredOrders = orders.filter((order) => {
    const matchesSearch =
      (order.salesOrderNo || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (order.poNumber || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (order.customerName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.items.some((i) => i.sku.toLowerCase().includes(searchTerm.toLowerCase()) || i.itemName.toLowerCase().includes(searchTerm.toLowerCase()));

    if (!matchesSearch) return false;

    if (statusFilter === 'ALL') return true;
    if (statusFilter === 'PENDING') return (order.fulfillmentStatus === 'OUTSTANDING' || order.status === 'PENDING') && !order.isLocked;
    if (statusFilter === 'ALLOCATED') return (order.totalAllocatedCtn || 0) >= (order.totalOrderCtn || 1) && order.fulfillmentStatus !== 'FULFILLED' && !order.isLocked;
    if (statusFilter === 'PARTIAL') return order.fulfillmentStatus === 'PARTIAL' && !order.isLocked;
    if (statusFilter === 'FULFILLED') return order.fulfillmentStatus === 'FULFILLED' || order.status === 'DONE' || order.isLocked;
    if (statusFilter === 'LOCKED') return Boolean(order.isLocked);
    return true;
  });

  // Handle local allocation input changes
  const handleAllocChange = (orderId: string, sku: string, field: 'orderQty' | 'allocQty' | 'remark', value: any) => {
    setEditingAllocations((prev) => {
      const orderEdits = prev[orderId] || {};
      const itemEdit = orderEdits[sku] || {
        orderQty: orders.find((o) => o.id === orderId)?.items.find((i) => i.sku === sku)?.orderQtyCtn || 0,
        allocQty: orders.find((o) => o.id === orderId)?.items.find((i) => i.sku === sku)?.allocateQty || 0,
        remark: orders.find((o) => o.id === orderId)?.items.find((i) => i.sku === sku)?.remark || ''
      };

      return {
        ...prev,
        [orderId]: {
          ...orderEdits,
          [sku]: {
            ...itemEdit,
            [field]: field === 'remark' ? value : Number(value)
          }
        }
      };
    });
  };

  // Get current edit or fallback value
  const getItemValue = (order: PickOrder, item: OrderItem, field: 'orderQty' | 'allocQty' | 'remark') => {
    const orderEdits = editingAllocations[order.id];
    if (orderEdits && orderEdits[item.sku]) {
      return orderEdits[item.sku][field];
    }
    if (field === 'orderQty') return item.orderQtyCtn ?? item.requestedQty ?? 0;
    if (field === 'allocQty') return item.allocateQty ?? 0;
    return item.remark ?? '';
  };

  // Save Allocation Changes
  const handleSaveAllocation = async (order: PickOrder) => {
    setSavingOrderId(order.id);
    try {
      const orderEdits = editingAllocations[order.id];
      const updatedItemsPayload = order.items.map((item) => {
        const edit = orderEdits ? orderEdits[item.sku] : null;
        return {
          id: item.id,
          sku: item.sku,
          orderQtyCtn: edit ? edit.orderQty : (item.orderQtyCtn ?? item.requestedQty ?? 0),
          allocateQty: edit ? edit.allocQty : (item.allocateQty ?? 0),
          remark: edit ? edit.remark : (item.remark ?? '')
        };
      });

      await updateSalesOrderAllocation(order.id, {
        items: updatedItemsPayload
      });

      onLogAuditActivity(
        'INVENTORY',
        'SALES_ORDER_ALLOCATION_UPDATED',
        order.salesOrderNo || order.id,
        `Saved allocation changes for ${order.customerName} (${order.salesOrderNo || order.id}).`,
        'INFO'
      );

      await onRefresh();
    } catch (err: any) {
      alert(`Error saving allocation: ${err.message || 'Failed'}`);
    } finally {
      setSavingOrderId(null);
    }
  };

  // Auto Allocate FEFO
  const handleAutoAllocate = async (order: PickOrder) => {
    setSavingOrderId(order.id);
    try {
      await autoAllocateSalesOrder(order.id);
      onLogAuditActivity(
        'INVENTORY',
        'AUTO_ALLOCATION_EXECUTED',
        order.salesOrderNo || order.id,
        `Auto-allocated FEFO stock for ${order.customerName}.`,
        'INFO'
      );
      await onRefresh();
    } catch (err: any) {
      alert(`Auto-allocation failed: ${err.message || 'Failed'}`);
    } finally {
      setSavingOrderId(null);
    }
  };

  // Delete / Cancel Order - Trigger Confirmation Popup
  const handleDeleteOrder = (order: PickOrder) => {
    setOrderToDelete(order);
    setShowDeleteOrderModal(true);
  };

  const handleConfirmDeleteOrder = async () => {
    if (!orderToDelete) return;
    setIsDeletingOrder(true);
    try {
      await deleteSalesOrder(orderToDelete.id);
      onLogAuditActivity(
        'INVENTORY',
        'SALES_ORDER_DELETED',
        orderToDelete.salesOrderNo || orderToDelete.id,
        `Deleted Sales Order for ${orderToDelete.customerName}.`,
        'WARNING'
      );
      await onRefresh();
      setShowDeleteOrderModal(false);
      setOrderToDelete(null);
    } catch (err: any) {
      alert(`Delete failed: ${err.message || 'Failed'}`);
    } finally {
      setIsDeletingOrder(false);
    }
  };

  // Lock / Unlock Sales Order (Consider Done)
  const [lockingOrderId, setLockingOrderId] = useState<string | null>(null);

  const handleToggleLockOrder = async (order: PickOrder) => {
    setLockingOrderId(order.id);
    try {
      const willLock = !order.isLocked;
      await lockSalesOrder(order.id, willLock);
      onLogAuditActivity(
        'INVENTORY',
        willLock ? 'SALES_ORDER_LOCKED' : 'SALES_ORDER_UNLOCKED',
        order.salesOrderNo || order.id,
        willLock
          ? `Locked Sales Order ${order.salesOrderNo || order.id} as FULFILLED and DONE.`
          : `Unlocked Sales Order ${order.salesOrderNo || order.id} for edits.`,
        'INFO'
      );
      await onRefresh();
    } catch (err: any) {
      alert(`Lock action failed: ${err.message || 'Failed'}`);
    } finally {
      setLockingOrderId(null);
    }
  };

  // Modal item row management
  const handleAddModalRow = () => {
    setNewItemRows((prev) => [...prev, { sku: skus[0]?.sku || 'ML121101', orderQty: 10, allocQty: 10, remark: '' }]);
  };

  const handleRemoveModalRow = (index: number) => {
    setNewItemRows((prev) => prev.filter((_, i) => i !== index));
  };

  const handleModalRowChange = (index: number, field: string, value: any) => {
    setNewItemRows((prev) =>
      prev.map((row, i) => (i === index ? { ...row, [field]: field === 'sku' || field === 'remark' ? value : Number(value) } : row))
    );
  };

  // Submit Create Order
  const handleCreateSalesOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCustomerName.trim() || newItemRows.length === 0) {
      alert('Please fill in Customer Name and add at least 1 item row.');
      return;
    }

    setIsSubmitting(true);
    try {
      await createSalesOrder({
        salesOrderNo: newSoNumber,
        poNumber: newPoNumber,
        customerName: newCustomerName,
        requiredDeliveryDate: newDeliveryDate,
        priority: newPriority,
        remark: newRemark,
        items: newItemRows.map((r) => ({
          sku: r.sku,
          orderQtyCtn: r.orderQty,
          allocateQty: r.allocQty,
          remark: r.remark
        }))
      });

      onLogAuditActivity(
        'INVENTORY',
        'SALES_ORDER_CREATED',
        newSoNumber,
        `Created Sales Order ${newSoNumber} for ${newCustomerName}.`,
        'INFO'
      );

      setShowCreateModal(false);
      // Reset form
      setNewCustomerName('San Francisco Coffee Outlets');
      setNewSoNumber(`SO-2026-${Math.floor(8000 + Math.random() * 1000)}`);
      setNewPoNumber(`PO-SFC-${Math.floor(1000 + Math.random() * 9000)}`);
      setNewItemRows([{ sku: 'ML221101', orderQty: 30, allocQty: 30, remark: '' }]);
      await onRefresh();
    } catch (err: any) {
      alert(`Failed to create sales order: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Top Banner & Header */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 rounded-2xl p-6 text-white shadow-md border border-slate-800">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center space-x-2">
              <span className="p-2 bg-indigo-600/30 border border-indigo-400/30 rounded-xl text-indigo-300">
                <ShoppingBag className="w-6 h-6" />
              </span>
              <h1 className="text-2xl font-black tracking-tight text-white">
                Sales Order & Stock Allocation Management
              </h1>
            </div>
            <p className="text-xs text-slate-300 max-w-2xl font-sans">
              Track customer demand, manage line item order & allocation quantities in Cartons (CTN), and automatically update and reserve stock across warehouse inventory.
            </p>
          </div>

          <div className="flex items-center space-x-3">
            <button
              onClick={() => setShowCustomerModal(true)}
              className="px-3.5 py-2.5 bg-slate-800 hover:bg-slate-700 text-indigo-200 border border-slate-700 rounded-xl transition-all text-xs font-bold flex items-center space-x-2 cursor-pointer shadow-xs"
              title="Manage Customer Profiles & Accounts"
            >
              <Users className="w-4 h-4 text-indigo-400" />
              <span>Customer Directory</span>
            </button>

            <button
              onClick={handleSyncWms}
              disabled={isSyncing}
              className="p-2.5 bg-slate-800/80 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl transition-all text-xs font-semibold flex items-center space-x-2 cursor-pointer disabled:opacity-50"
              title="Refresh Sales Orders and Inventory State"
            >
              <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin text-indigo-400' : ''}`} />
              <span>{isSyncing ? 'Syncing...' : 'Sync WMS'}</span>
            </button>

            <button
              onClick={() => handleOpenOutboundModal()}
              className="px-4 py-2.5 bg-gradient-to-r from-rose-600 via-rose-700 to-rose-800 hover:from-rose-700 hover:to-rose-900 text-white font-extrabold rounded-xl shadow-md border border-rose-500 transition-all text-xs flex items-center space-x-2 cursor-pointer"
              title="Perform loose stock deliver deduction or fulfill an active Sales Order"
            >
              <PackageMinus className="w-4 h-4 text-rose-200" />
              <span>Outbound Stock Deliver</span>
            </button>

            {canEditOrders ? (
              <button
                onClick={() => setShowCreateModal(true)}
                className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl shadow-sm border border-indigo-400 transition-all text-xs flex items-center space-x-2 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>New Sales Order</span>
              </button>
            ) : (
              <button
                onClick={onOpenRoleModal}
                className="px-4 py-2.5 bg-amber-600/80 hover:bg-amber-600 text-white font-bold rounded-xl shadow-sm border border-amber-500 transition-all text-xs flex items-center space-x-2 cursor-pointer"
              >
                <AlertCircle className="w-4 h-4" />
                <span>Request Allocation Rights</span>
              </button>
            )}
          </div>
        </div>

        {/* High Level KPI Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 mt-6 pt-5 border-t border-slate-800 font-mono text-xs">
          <div className="bg-slate-800/50 p-3 rounded-xl border border-slate-700/60">
            <div className="text-[11px] text-slate-400 uppercase font-sans font-semibold">Total Orders</div>
            <div className="text-xl font-black text-white mt-1">{totalOrdersCount} <span className="text-xs text-slate-400 font-normal">SO</span></div>
          </div>

          <div className="bg-slate-800/50 p-3 rounded-xl border border-slate-700/60">
            <div className="text-[11px] text-slate-400 uppercase font-sans font-semibold">Order Qty (CTN)</div>
            <div className="text-xl font-black text-blue-300 mt-1">{totalOrderCtn}</div>
          </div>

          <div className="bg-slate-800/50 p-3 rounded-xl border border-slate-700/60">
            <div className="text-[11px] text-slate-400 uppercase font-sans font-semibold">Allocated Qty (CTN)</div>
            <div className="text-xl font-black text-emerald-300 mt-1">{totalAllocatedCtn}</div>
          </div>

          <div className="bg-slate-800/50 p-3 rounded-xl border border-slate-700/60">
            <div className="text-[11px] text-slate-400 uppercase font-sans font-semibold">Reserved Stock (CTN)</div>
            <div className="text-xl font-black text-amber-300 mt-1">{totalReservedInCatalog}</div>
          </div>

          <div className="bg-slate-800/50 p-3 rounded-xl border border-slate-700/60">
            <div className="text-[11px] text-slate-400 uppercase font-sans font-semibold">Outstanding Qty</div>
            <div className="text-xl font-black text-rose-300 mt-1">{totalOutstandingCtn}</div>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row items-center justify-between gap-4">
        
        {/* Search Input */}
        <div className="relative w-full md:w-96">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
          <input
            type="text"
            placeholder="Search SO#, PO#, Customer or SKU..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 focus:bg-white focus:outline-none transition-all"
          />
          {searchTerm && (
            <button onClick={() => setSearchTerm('')} className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Status Filter Tabs */}
        <div className="flex items-center space-x-1.5 overflow-x-auto w-full md:w-auto">
          <span className="text-xs text-slate-500 font-semibold mr-1 flex items-center space-x-1">
            <Filter className="w-3.5 h-3.5" />
            <span>Status:</span>
          </span>

          {[
            { id: 'ALL', label: 'All Orders' },
            { id: 'PENDING', label: 'Outstanding' },
            { id: 'ALLOCATED', label: 'Fully Allocated' },
            { id: 'PARTIAL', label: 'Partial' },
            { id: 'FULFILLED', label: 'Fulfilled' },
            { id: 'LOCKED', label: '🔒 Locked & Done' }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setStatusFilter(tab.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                statusFilter === tab.id
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

      </div>

      {/* Sales Orders List */}
      <div className="space-y-4">
        {filteredOrders.length === 0 ? (
          <div className="bg-white rounded-2xl p-12 text-center border border-slate-200 shadow-xs">
            <ShoppingBag className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <h3 className="text-sm font-bold text-slate-800">No Sales Orders Match Your Query</h3>
            <p className="text-xs text-slate-500 mt-1">Try resetting your search filter or create a new customer sales order.</p>
          </div>
        ) : (
          filteredOrders.map((order) => {
            const isExpanded = expandedOrderId === order.id;

            const orderTotalCtn = order.totalOrderCtn || order.items.reduce((s, i) => s + (i.orderQtyCtn || i.requestedQty || 0), 0);
            const orderAllocCtn = order.totalAllocatedCtn || order.items.reduce((s, i) => s + (i.allocateQty || 0), 0);
            const orderFulfilledCtn = order.totalFulfilledCtn || order.items.reduce((s, i) => s + (i.fulfillmentQty || i.pickedQty || 0), 0);
            const orderOutstandingCtn = order.totalOutstandingCtn || Math.max(0, orderTotalCtn - orderFulfilledCtn);

            const allocPercentage = orderTotalCtn > 0 ? Math.min(100, Math.round((orderAllocCtn / orderTotalCtn) * 100)) : 0;

            return (
              <div
                key={order.id}
                className={`bg-white border rounded-2xl shadow-xs transition-all overflow-hidden ${
                  isExpanded ? 'border-indigo-500 ring-1 ring-indigo-500/20' : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                {/* Order Summary Header Card */}
                <div
                  onClick={() => setExpandedOrderId(isExpanded ? null : order.id)}
                  className="p-5 cursor-pointer bg-slate-50/40 hover:bg-slate-50 flex flex-col lg:flex-row lg:items-center justify-between gap-4 select-none"
                >
                  <div className="flex items-start space-x-4">
                    <div className="p-3 bg-indigo-50 text-indigo-700 rounded-xl border border-indigo-100 flex-shrink-0">
                      <User className="w-5 h-5" />
                    </div>

                    <div>
                      <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                        <span className="font-extrabold text-slate-900 text-base">{order.customerName}</span>
                        <span className="px-2.5 py-0.5 rounded-md font-mono text-[11px] font-bold bg-slate-900 text-white">
                          {order.salesOrderNo || order.id}
                        </span>
                        {order.poNumber && (
                          <span className="px-2 py-0.5 rounded-md font-mono text-[11px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                            PO: {order.poNumber}
                          </span>
                        )}
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wide ${
                            order.priority === 'URGENT'
                              ? 'bg-rose-100 text-rose-800 border border-rose-300'
                              : order.priority === 'HIGH'
                              ? 'bg-amber-100 text-amber-800 border border-amber-300'
                              : 'bg-blue-100 text-blue-800 border border-blue-300'
                          }`}
                        >
                          {order.priority}
                        </span>

                        {order.isLocked ? (
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wide bg-amber-100 text-amber-900 border border-amber-300 flex items-center space-x-1 shadow-2xs">
                            <Lock className="w-3 h-3 text-amber-700" />
                            <span>LOCKED & DONE</span>
                          </span>
                        ) : orderFulfilledCtn >= orderTotalCtn && orderTotalCtn > 0 ? (
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wide bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center space-x-1">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            <span>FULFILLED</span>
                          </span>
                        ) : null}
                      </div>

                      <div className="flex items-center space-x-4 mt-2 text-xs text-slate-500 font-sans">
                        <span className="flex items-center space-x-1">
                          <Calendar className="w-3.5 h-3.5 text-slate-400" />
                          <span>Order Date: <strong className="text-slate-700 font-mono">{order.orderDate.split(' ')[0]}</strong></span>
                        </span>
                        <span>•</span>
                        <span>Delivery Due: <strong className="text-slate-700 font-mono">{order.requiredDeliveryDate}</strong></span>
                        <span>•</span>
                        <span>Bay: <strong className="text-slate-700 font-mono">{order.destinationZone}</strong></span>
                      </div>
                    </div>
                  </div>

                  {/* Right side Order Metrics */}
                  <div className="flex items-center space-x-6">
                    <div className="grid grid-cols-4 gap-4 text-right font-mono text-xs">
                      <div>
                        <div className="text-[10px] text-slate-400 uppercase font-sans font-semibold">Order Qty</div>
                        <div className="font-bold text-slate-900 text-sm mt-0.5">{orderTotalCtn} <span className="text-[10px] text-slate-500">CTN</span></div>
                      </div>

                      <div>
                        <div className="text-[10px] text-slate-400 uppercase font-sans font-semibold">Allocated</div>
                        <div className="font-bold text-emerald-700 text-sm mt-0.5">{orderAllocCtn} <span className="text-[10px] text-slate-500">CTN</span></div>
                      </div>

                      <div>
                        <div className="text-[10px] text-slate-400 uppercase font-sans font-semibold">Fulfilled</div>
                        <div className="font-bold text-blue-700 text-sm mt-0.5">{orderFulfilledCtn} <span className="text-[10px] text-slate-500">CTN</span></div>
                      </div>

                      <div>
                        <div className="text-[10px] text-slate-400 uppercase font-sans font-semibold">Outstanding</div>
                        <div className={`font-bold text-sm mt-0.5 ${orderOutstandingCtn > 0 ? 'text-amber-700' : 'text-slate-400'}`}>
                          {orderOutstandingCtn} <span className="text-[10px] text-slate-500">CTN</span>
                        </div>
                      </div>
                    </div>

                    {/* Allocation Progress Badge */}
                    <div className="w-28 text-center flex-shrink-0">
                      <div className="text-[10px] text-slate-500 font-sans font-bold mb-1">
                        Allocation {allocPercentage}%
                      </div>
                      <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all duration-300 ${
                            allocPercentage === 100 ? 'bg-emerald-500' : allocPercentage > 0 ? 'bg-amber-500' : 'bg-slate-300'
                          }`}
                          style={{ width: `${allocPercentage}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Expanded Detailed Items & Allocation Table */}
                {isExpanded && (() => {
                  const isOrderFulfilled = (orderFulfilledCtn >= orderTotalCtn && orderTotalCtn > 0) || order.fulfillmentStatus === 'FULFILLED' || order.status === 'DONE';

                  return (
                    <div className="p-5 border-t border-slate-200 bg-slate-50/20 space-y-4">
                      
                      {order.isLocked && (
                        <div className="p-3.5 bg-slate-900 text-amber-300 rounded-xl text-xs font-semibold flex flex-col sm:flex-row sm:items-center justify-between gap-3 border border-slate-700 shadow-xs">
                          <div className="flex items-center space-x-2.5">
                            <div className="p-2 bg-amber-400/20 text-amber-400 rounded-lg border border-amber-400/30 flex-shrink-0">
                              <Lock className="w-4 h-4" />
                            </div>
                            <div>
                              <div className="font-extrabold text-amber-200 text-xs flex items-center space-x-2">
                                <span>SALES ORDER IS LOCKED & CONSIDERED DONE</span>
                              </div>
                              <p className="text-[11px] text-slate-300 mt-0.5">
                                All line item quantities are finalized and marked fulfilled{order.lockedAt ? ` on ${order.lockedAt}` : ''}. Inventory state is locked against accidental modifications.
                              </p>
                            </div>
                          </div>
                          {canEditOrders && (
                            <button
                              onClick={() => handleToggleLockOrder(order)}
                              disabled={lockingOrderId === order.id}
                              className="px-3.5 py-1.5 bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-xs rounded-lg transition-all flex items-center space-x-1.5 cursor-pointer disabled:opacity-50 flex-shrink-0"
                            >
                              <Unlock className="w-3.5 h-3.5" />
                              <span>{lockingOrderId === order.id ? 'Unlocking...' : 'Unlock Order'}</span>
                            </button>
                          )}
                        </div>
                      )}

                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs">
                        <div>
                          <h4 className="font-bold text-xs uppercase tracking-wider text-slate-800 flex items-center space-x-2">
                            <Layers className="w-4 h-4 text-indigo-600" />
                            <span>Line Item Order & Allocation Quantities (CTN)</span>
                          </h4>
                          <p className="text-[11px] text-slate-500 mt-0.5">
                            {order.isLocked
                              ? 'This sales order is locked. Unlock the order if you need to adjust line item allocations.'
                              : 'Adjust the allocation quantity below to update reserved stock across the inventory catalog in real-time.'}
                          </p>
                        </div>

                        {canEditOrders && !order.isLocked && (
                          <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                            {isOrderFulfilled ? (
                              <button
                                onClick={() => handleToggleLockOrder(order)}
                                disabled={lockingOrderId === order.id}
                                className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-extrabold rounded-lg text-xs transition-all shadow-xs flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
                                title="Sales Order is fulfilled. Click to lock and consider done."
                              >
                                <Lock className="w-3.5 h-3.5 text-slate-950" />
                                <span>{lockingOrderId === order.id ? 'Locking...' : 'Lock Order (Done)'}</span>
                              </button>
                            ) : (
                              <button
                                onClick={() => handleToggleLockOrder(order)}
                                disabled={lockingOrderId === order.id}
                                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 rounded-lg text-xs font-bold transition-all flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
                                title="Fulfill all items and lock order as done"
                              >
                                <Lock className="w-3.5 h-3.5 text-amber-400" />
                                <span>{lockingOrderId === order.id ? 'Locking...' : 'Mark Fulfilled & Lock'}</span>
                              </button>
                            )}

                            <button
                              onClick={() => handleOpenOutboundModal(undefined, undefined, order.id)}
                              className="px-3.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-300 rounded-lg text-xs font-bold transition-all flex items-center space-x-1.5 cursor-pointer shadow-2xs"
                              title="Deduct loose stock and update fulfilled cartons for this Sales Order"
                            >
                              <PackageMinus className="w-3.5 h-3.5 text-rose-600" />
                              <span>Loose Outbound</span>
                            </button>

                            <button
                              onClick={() => handleAutoAllocate(order)}
                              disabled={savingOrderId === order.id}
                              className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 rounded-lg text-xs font-bold transition-all flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
                              title="Auto allocate maximum available FEFO stock"
                            >
                              <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                              <span>Auto-Allocate FEFO</span>
                            </button>

                            <button
                              onClick={() => handleSaveAllocation(order)}
                              disabled={savingOrderId === order.id}
                              className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition-all shadow-xs flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
                            >
                              <Save className="w-3.5 h-3.5" />
                              <span>{savingOrderId === order.id ? 'Saving...' : 'Update & Reserve Stock'}</span>
                            </button>

                            <button
                              onClick={() => handleDeleteOrder(order)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all cursor-pointer"
                              title="Delete / Cancel Order"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </div>

                    {/* Table of Order Items */}
                    <div className="overflow-x-auto bg-white rounded-xl border border-slate-200 shadow-xs">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-800 text-white uppercase text-[10px] font-mono font-bold tracking-wider">
                          <tr>
                            <th className="p-3 border-r border-slate-700">SKU Code</th>
                            <th className="p-3 border-r border-slate-700">Item Description</th>
                            <th className="p-3 border-r border-slate-700 text-right bg-slate-900">Current Stock</th>
                            <th className="p-3 border-r border-slate-700 text-right bg-amber-900/60">Reserved Stock</th>
                            <th className="p-3 border-r border-slate-700 text-right bg-blue-900/60">Order Qty (CTN)</th>
                            <th className="p-3 border-r border-slate-700 text-right bg-emerald-900/80">Allocated Qty (CTN)</th>
                            <th className="p-3 border-r border-slate-700 text-right">Fulfilled</th>
                            <th className="p-3 border-r border-slate-700 text-right">Outstanding</th>
                            <th className="p-3">Stock Status / Remark</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 font-sans">
                          {order.items.map((item) => {
                            const matchedSku = skus.find((s) => s.sku === item.sku);
                            const currentStock = matchedSku ? (matchedSku.stockIn ?? matchedSku.currentQty ?? 0) - (matchedSku.stockOut ?? 0) : 0;
                            const currentReserved = matchedSku ? matchedSku.reserved || 0 : 0;
                            const availableForAlloc = currentStock - currentReserved;

                            const currentOrderQty = getItemValue(order, item, 'orderQty') as number;
                            const currentAllocQty = getItemValue(order, item, 'allocQty') as number;
                            const currentRemark = getItemValue(order, item, 'remark') as string;

                            const isStockSufficient = availableForAlloc >= (currentOrderQty - currentAllocQty);

                            return (
                              <tr key={item.id || item.sku} className="hover:bg-slate-50 transition-colors">
                                
                                <td className="p-3 font-mono font-bold text-indigo-700 whitespace-nowrap">
                                  {item.sku}
                                </td>

                                <td className="p-3 font-semibold text-slate-900 min-w-[200px]">
                                  {item.itemName}
                                </td>

                                <td className="p-3 font-mono font-bold text-slate-800 text-right bg-slate-50/50">
                                  {currentStock} CTN
                                </td>

                                <td className="p-3 font-mono font-bold text-amber-700 text-right bg-amber-50/40">
                                  {currentReserved} CTN
                                </td>

                                {/* Editable Order Quantity */}
                                <td className="p-2 text-right bg-blue-50/30">
                                  {canEditOrders && !order.isLocked ? (
                                    <input
                                      type="number"
                                      min="0"
                                      value={currentOrderQty}
                                      onChange={(e) => handleAllocChange(order.id, item.sku, 'orderQty', e.target.value)}
                                      className="w-20 px-2 py-1 text-right font-mono font-bold text-slate-900 border border-slate-300 rounded focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-white"
                                    />
                                  ) : (
                                    <span className="font-mono font-bold text-slate-900">{currentOrderQty} CTN</span>
                                  )}
                                </td>

                                {/* Editable Allocation Quantity */}
                                <td className="p-2 text-right bg-emerald-50/40">
                                  {canEditOrders && !order.isLocked ? (
                                    <div className="flex items-center justify-end space-x-1">
                                      <input
                                        type="number"
                                        min="0"
                                        max={currentOrderQty}
                                        value={currentAllocQty}
                                        onChange={(e) => handleAllocChange(order.id, item.sku, 'allocQty', e.target.value)}
                                        className="w-20 px-2 py-1 text-right font-mono font-black text-emerald-800 border border-emerald-400 bg-white rounded focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                                      />
                                      <span className="text-[10px] font-mono text-emerald-700">CTN</span>
                                    </div>
                                  ) : (
                                    <span className="font-mono font-bold text-emerald-800">{currentAllocQty} CTN</span>
                                  )}
                                </td>

                                <td className="p-3 font-mono font-bold text-blue-800 text-right">
                                  {item.fulfillmentQty || item.pickedQty || 0} CTN
                                </td>

                                <td className="p-3 font-mono font-bold text-rose-700 text-right">
                                  {item.outstandingQty ?? Math.max(0, currentOrderQty - (item.fulfillmentQty || 0))} CTN
                                </td>

                                <td className="p-3">
                                  <div className="flex items-center space-x-2">
                                    {currentAllocQty >= currentOrderQty && currentOrderQty > 0 ? (
                                      <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center space-x-1">
                                        <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                        <span>Fully Reserved</span>
                                      </span>
                                    ) : currentAllocQty > 0 ? (
                                      <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-amber-100 text-amber-800 border border-amber-300 flex items-center space-x-1">
                                        <Clock className="w-3 h-3 text-amber-600" />
                                        <span>Partial Reserve ({currentAllocQty}/{currentOrderQty})</span>
                                      </span>
                                    ) : (
                                      <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-rose-100 text-rose-800 border border-rose-300 flex items-center space-x-1">
                                        <AlertCircle className="w-3 h-3 text-rose-600" />
                                        <span>Unallocated</span>
                                      </span>
                                    )}

                                    {canEditOrders && !order.isLocked ? (
                                      <input
                                        type="text"
                                        placeholder="Add remark..."
                                        value={currentRemark}
                                        onChange={(e) => handleAllocChange(order.id, item.sku, 'remark', e.target.value)}
                                        className="text-[11px] px-2 py-1 border border-slate-200 rounded text-slate-700 w-36 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                                      />
                                    ) : (
                                      <span className="text-[11px] text-slate-500 italic">{currentRemark}</span>
                                    )}
                                  </div>
                                </td>

                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {order.remark && (
                      <div className="p-3 bg-amber-50/60 border border-amber-200 rounded-xl text-xs text-amber-900 font-sans flex items-center space-x-2">
                        <FileText className="w-4 h-4 text-amber-600 flex-shrink-0" />
                        <span><strong>Order Note:</strong> {order.remark}</span>
                      </div>
                    )}

                  </div>
                );
              })()}
              </div>
            );
          })
        )}
      </div>

      {/* CREATE NEW SALES ORDER MODAL */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-3xl overflow-hidden my-8">
            
            <div className="p-5 bg-gradient-to-r from-slate-900 to-indigo-950 text-white flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <ShoppingBag className="w-5 h-5 text-indigo-400" />
                <h3 className="font-extrabold text-base">Create New Customer Sales Order</h3>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateSalesOrder} className="p-6 space-y-6">
              
              {/* Top Form Fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 font-sans">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-bold text-slate-700">Customer Profile / Account</label>
                    <button
                      type="button"
                      onClick={() => setShowCreateCustomerModal(true)}
                      className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center space-x-1 cursor-pointer"
                    >
                      <PlusCircle className="w-3.5 h-3.5" />
                      <span>+ New Profile</span>
                    </button>
                  </div>
                  <select
                    value={newCustomerName}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === '__CREATE_NEW__') {
                        setShowCreateCustomerModal(true);
                        return;
                      }
                      setNewCustomerName(val);
                      const matchedCust = customers.find((c) => c.companyName === val);
                      if (matchedCust && matchedCust.customerCode) {
                        const cleanCode = matchedCust.customerCode.replace(/^CUST-/, '');
                        setNewPoNumber(`PO-${cleanCode}-${Math.floor(1000 + Math.random() * 9000)}`);
                      }
                    }}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  >
                    <option value="">-- Choose Customer Profile --</option>
                    {customers.map((cust) => (
                      <option key={cust.id} value={cust.companyName}>
                        {cust.companyName} ({cust.customerCode})
                      </option>
                    ))}
                    <option value="__CREATE_NEW__" className="font-bold text-indigo-600">
                      + Add New Customer Profile...
                    </option>
                  </select>
                  <input
                    type="text"
                    required
                    value={newCustomerName}
                    onChange={(e) => setNewCustomerName(e.target.value)}
                    placeholder="Or enter custom customer name..."
                    className="w-full mt-1.5 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none text-slate-700 font-medium"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Sales Order No (SO#)</label>
                  <input
                    type="text"
                    required
                    value={newSoNumber}
                    onChange={(e) => setNewSoNumber(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono font-bold focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Customer PO Number</label>
                  <input
                    type="text"
                    value={newPoNumber}
                    onChange={(e) => setNewPoNumber(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Required Delivery Date</label>
                  <input
                    type="date"
                    required
                    value={newDeliveryDate}
                    onChange={(e) => setNewDeliveryDate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Order Priority</label>
                  <select
                    value={newPriority}
                    onChange={(e) => setNewPriority(e.target.value as any)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-bold focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  >
                    <option value="NORMAL">NORMAL</option>
                    <option value="HIGH">HIGH</option>
                    <option value="URGENT">URGENT</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Order Remarks</label>
                  <input
                    type="text"
                    value={newRemark}
                    onChange={(e) => setNewRemark(e.target.value)}
                    placeholder="Delivery instructions..."
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Items Table Builder */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-xs uppercase tracking-wider text-slate-800">Order Line Items & Allocation</h4>
                  <button
                    type="button"
                    onClick={handleAddModalRow}
                    className="px-3 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg text-xs font-bold flex items-center space-x-1 cursor-pointer transition-all"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Item Line</span>
                  </button>
                </div>

                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-100 text-slate-700 font-mono text-[11px] font-bold uppercase">
                      <tr>
                        <th className="p-2.5 border-r border-slate-200">SKU Item</th>
                        <th className="p-2.5 border-r border-slate-200 text-right">Avail Stock</th>
                        <th className="p-2.5 border-r border-slate-200 text-right">Order Qty (CTN)</th>
                        <th className="p-2.5 border-r border-slate-200 text-right">Allocate Qty (CTN)</th>
                        <th className="p-2.5 border-r border-slate-200">Remark</th>
                        <th className="p-2.5 text-center w-10">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {newItemRows.map((row, idx) => {
                        const matchedSku = skus.find((s) => s.sku === row.sku);
                        const currentAvailable = matchedSku ? (matchedSku.stockIn ?? matchedSku.currentQty ?? 0) - (matchedSku.stockOut ?? 0) - (matchedSku.reserved || 0) : 0;

                        return (
                          <tr key={idx} className="hover:bg-slate-50">
                            
                            <td className="p-2 border-r border-slate-200">
                              <select
                                value={row.sku}
                                onChange={(e) => handleModalRowChange(idx, 'sku', e.target.value)}
                                className="w-full px-2 py-1 bg-white border border-slate-300 rounded font-mono text-xs font-bold focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                              >
                                {skus.map((s) => (
                                  <option key={s.sku} value={s.sku}>
                                    {s.sku} - {s.name}
                                  </option>
                                ))}
                              </select>
                            </td>

                            <td className={`p-2 border-r border-slate-200 text-right font-mono font-bold ${currentAvailable < 0 ? 'text-rose-600 bg-rose-50 font-extrabold' : 'text-slate-700'}`}>
                              {currentAvailable} CTN
                            </td>

                            <td className="p-2 border-r border-slate-200 text-right">
                              <input
                                type="number"
                                min="1"
                                value={row.orderQty}
                                onChange={(e) => handleModalRowChange(idx, 'orderQty', e.target.value)}
                                className="w-20 px-2 py-1 text-right font-mono font-bold border border-slate-300 rounded focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                              />
                            </td>

                            <td className="p-2 border-r border-slate-200 text-right">
                              <input
                                type="number"
                                min="0"
                                value={row.allocQty}
                                onChange={(e) => handleModalRowChange(idx, 'allocQty', e.target.value)}
                                className="w-20 px-2 py-1 text-right font-mono font-bold text-emerald-800 border border-emerald-300 bg-emerald-50/50 rounded focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                              />
                            </td>

                            <td className="p-2 border-r border-slate-200">
                              <input
                                type="text"
                                placeholder="Line note..."
                                value={row.remark}
                                onChange={(e) => handleModalRowChange(idx, 'remark', e.target.value)}
                                className="w-full px-2 py-1 text-xs border border-slate-300 rounded focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                              />
                            </td>

                            <td className="p-2 text-center">
                              {newItemRows.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => handleRemoveModalRow(idx)}
                                  className="text-slate-400 hover:text-rose-600 p-1 rounded"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </td>

                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Form Buttons */}
              <div className="flex items-center justify-end space-x-3 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 border border-slate-300 rounded-xl text-slate-700 text-xs font-bold hover:bg-slate-100 transition-all cursor-pointer"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-sm transition-all cursor-pointer disabled:opacity-50 flex items-center space-x-1.5"
                >
                  <Check className="w-4 h-4" />
                  <span>{isSubmitting ? 'Creating Order...' : 'Create Order & Reserve Stock'}</span>
                </button>
              </div>

            </form>

          </div>
        </div>
      )}

      {/* CUSTOMER DIRECTORY MODAL */}
      {showCustomerModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl overflow-hidden my-6 flex flex-col max-h-[90vh]">
            
            {/* Modal Header */}
            <div className="p-5 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center space-x-3">
                <span className="p-2 bg-indigo-500/20 border border-indigo-400/30 rounded-xl text-indigo-300">
                  <Users className="w-5 h-5" />
                </span>
                <div>
                  <h3 className="font-extrabold text-base">Customer Account Directory & Profiles</h3>
                  <p className="text-xs text-slate-300">Manage registered client profiles, credit limits, payment terms & preferred delivery zones</p>
                </div>
              </div>
              <button
                onClick={() => setShowCustomerModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Sub-Header Actions */}
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
              <div className="relative w-full sm:w-72">
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search customer, code, or contact..."
                  value={customerSearchTerm}
                  onChange={(e) => setCustomerSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 bg-white border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center space-x-2 w-full sm:w-auto justify-end">
                <button
                  onClick={() => setShowCreateCustomerModal(true)}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs flex items-center space-x-1.5 shadow-xs cursor-pointer transition-all"
                >
                  <Plus className="w-4 h-4" />
                  <span>+ Register New Customer</span>
                </button>
              </div>
            </div>

            {/* Customer Cards List */}
            <div className="p-6 overflow-y-auto space-y-4">
              {customers.filter(c =>
                c.companyName.toLowerCase().includes(customerSearchTerm.toLowerCase()) ||
                c.customerCode.toLowerCase().includes(customerSearchTerm.toLowerCase()) ||
                c.contactPerson.toLowerCase().includes(customerSearchTerm.toLowerCase())
              ).length === 0 ? (
                <div className="text-center py-12 text-slate-500 bg-slate-50 rounded-xl border border-dashed border-slate-300">
                  <Users className="w-10 h-10 mx-auto text-slate-400 mb-2" />
                  <p className="font-bold text-sm">No Customer Profiles Found</p>
                  <p className="text-xs text-slate-400">Click "+ Register New Customer" above to create a profile.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {customers
                    .filter(c =>
                      c.companyName.toLowerCase().includes(customerSearchTerm.toLowerCase()) ||
                      c.customerCode.toLowerCase().includes(customerSearchTerm.toLowerCase()) ||
                      c.contactPerson.toLowerCase().includes(customerSearchTerm.toLowerCase())
                    )
                    .map((cust) => (
                      <div
                        key={cust.id}
                        className="p-4 bg-white border border-slate-200 hover:border-indigo-300 rounded-xl shadow-xs hover:shadow-md transition-all flex flex-col justify-between"
                      >
                        <div className="space-y-3">
                          {/* Header */}
                          <div className="flex items-start justify-between">
                            <div>
                              <div className="flex items-center space-x-2">
                                <span className="font-extrabold text-sm text-slate-900">{cust.companyName}</span>
                                <span className="px-2 py-0.5 bg-slate-100 text-slate-700 font-mono text-[10px] font-bold rounded-md border border-slate-200">
                                  {cust.customerCode}
                                </span>
                              </div>
                              <span className="text-xs text-slate-500 font-medium flex items-center mt-0.5">
                                <Briefcase className="w-3 h-3 mr-1 text-slate-400" />
                                {cust.contactPerson || 'Purchasing Account'}
                              </span>
                            </div>
                            <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 font-bold text-[10px] rounded-full border border-emerald-200">
                              {cust.status}
                            </span>
                          </div>

                          {/* Contact Details */}
                          <div className="grid grid-cols-2 gap-2 text-xs bg-slate-50 p-2.5 rounded-lg border border-slate-100 font-sans">
                            {cust.email && (
                              <div className="flex items-center text-slate-600 truncate">
                                <Mail className="w-3 h-3 mr-1.5 text-indigo-500 shrink-0" />
                                <span className="truncate">{cust.email}</span>
                              </div>
                            )}
                            {cust.phone && (
                              <div className="flex items-center text-slate-600">
                                <Phone className="w-3 h-3 mr-1.5 text-indigo-500 shrink-0" />
                                <span>{cust.phone}</span>
                              </div>
                            )}
                            <div className="flex items-center text-slate-600">
                              <CreditCard className="w-3 h-3 mr-1.5 text-emerald-600 shrink-0" />
                              <span>Limit: RM {cust.creditLimit?.toLocaleString() || '100,000'}</span>
                            </div>
                            <div className="flex items-center text-slate-600">
                              <Clock className="w-3 h-3 mr-1.5 text-amber-600 shrink-0" />
                              <span>Terms: {cust.paymentTerms || 'NET 30'}</span>
                            </div>
                          </div>

                          {/* Address & Zone */}
                          <div className="text-xs text-slate-600 space-y-1">
                            {cust.address && (
                              <div className="flex items-start text-slate-600">
                                <MapPin className="w-3 h-3 mr-1.5 text-rose-500 shrink-0 mt-0.5" />
                                <span className="line-clamp-2">{cust.address}</span>
                              </div>
                            )}
                            {cust.preferredZone && (
                              <div className="flex items-center text-slate-500 text-[11px] font-medium">
                                <Truck className="w-3 h-3 mr-1 text-indigo-600 shrink-0" />
                                <span>Preferred Bay: {cust.preferredZone}</span>
                              </div>
                            )}
                          </div>

                          {cust.notes && (
                            <p className="text-[11px] text-slate-500 italic bg-amber-50/60 p-2 rounded border border-amber-200/60">
                              "{cust.notes}"
                            </p>
                          )}
                        </div>

                        {/* Card Footer Action */}
                        <div className="pt-3 mt-3 border-t border-slate-100 flex items-center justify-between gap-2 flex-wrap">
                          <span className="text-[10px] font-mono text-slate-400 shrink-0">ID: {cust.id}</span>
                          <div className="flex items-center space-x-1.5">
                            <button
                              onClick={() => handleStartEditCustomer(cust)}
                              className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg text-xs flex items-center space-x-1 transition-all cursor-pointer border border-slate-300"
                              title="Edit Customer Profile"
                            >
                              <Pencil className="w-3.5 h-3.5 text-slate-600" />
                              <span>Edit</span>
                            </button>

                            <button
                              onClick={() => handleDeleteCustomer(cust)}
                              className="px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold rounded-lg text-xs flex items-center space-x-1 transition-all cursor-pointer border border-rose-200"
                              title="Delete Customer Profile"
                            >
                              <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                              <span>DEL</span>
                            </button>

                            <button
                              onClick={() => {
                                setNewCustomerName(cust.companyName);
                                if (cust.customerCode) {
                                  setNewPoNumber(`PO-${cust.customerCode.replace(/^CUST-/, '')}-${Math.floor(1000 + Math.random() * 9000)}`);
                                }
                                setShowCustomerModal(false);
                                setShowCreateModal(true);
                              }}
                              className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold rounded-lg text-xs flex items-center space-x-1 transition-all cursor-pointer border border-indigo-200"
                            >
                              <ShoppingBag className="w-3.5 h-3.5" />
                              <span>Create SO</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-4 bg-slate-100 border-t border-slate-200 flex justify-between items-center shrink-0 text-xs">
              <span className="text-slate-500 font-medium">Total Registered Accounts: <strong className="text-slate-900 font-mono">{customers.length}</strong></span>
              <button
                onClick={() => setShowCustomerModal(false)}
                className="px-4 py-2 bg-slate-800 text-white font-bold rounded-xl hover:bg-slate-900 transition-all cursor-pointer"
              >
                Close Directory
              </button>
            </div>

          </div>
        </div>
      )}

      {/* CREATE NEW CUSTOMER PROFILE MODAL */}
      {showCreateCustomerModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden my-8">
            
            <div className="p-5 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Building className="w-5 h-5 text-indigo-400" />
                <h3 className="font-extrabold text-base">Register New Customer Profile</h3>
              </div>
              <button
                onClick={() => setShowCreateCustomerModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateCustomerSubmit} className="p-6 space-y-4 text-xs font-sans">
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Company / Business Name *</label>
                  <input
                    type="text"
                    required
                    value={custCompanyName}
                    onChange={(e) => setCustCompanyName(e.target.value)}
                    placeholder="e.g. Starbucks Malaysia Retail"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Customer Account Code</label>
                  <input
                    type="text"
                    value={custCode}
                    onChange={(e) => setCustCode(e.target.value)}
                    placeholder="e.g. CUST-SBUX (Auto-generated if empty)"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg font-mono focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Contact Person Name</label>
                  <input
                    type="text"
                    value={custContactPerson}
                    onChange={(e) => setCustContactPerson(e.target.value)}
                    placeholder="e.g. John Doe (Procurement Manager)"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Email Address</label>
                  <input
                    type="email"
                    value={custEmail}
                    onChange={(e) => setCustEmail(e.target.value)}
                    placeholder="e.g. procurement@starbucks.com.my"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Phone / Hotline Number</label>
                  <input
                    type="text"
                    value={custPhone}
                    onChange={(e) => setCustPhone(e.target.value)}
                    placeholder="e.g. +60 3-8000 1234"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Credit Limit (RM)</label>
                  <input
                    type="number"
                    min="0"
                    step="1000"
                    value={custCreditLimit}
                    onChange={(e) => setCustCreditLimit(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg font-mono font-bold focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Payment Terms</label>
                  <select
                    value={custPaymentTerms}
                    onChange={(e) => setCustPaymentTerms(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg font-bold focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  >
                    <option value="NET 14">NET 14 Days</option>
                    <option value="NET 30">NET 30 Days</option>
                    <option value="NET 45">NET 45 Days</option>
                    <option value="NET 60">NET 60 Days</option>
                    <option value="COD">Cash on Delivery (COD)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Preferred Outbound Staging Zone</label>
                  <select
                    value={custPreferredZone}
                    onChange={(e) => setCustPreferredZone(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none font-medium"
                  >
                    <option value="Outbound Express Bay 1">Outbound Express Bay 1</option>
                    <option value="Outbound Express Bay 2">Outbound Express Bay 2</option>
                    <option value="High Velocity Staging">High Velocity Staging</option>
                    <option value="Cold Storage Bay B">Cold Storage Bay B</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Delivery / HQ Address</label>
                <textarea
                  rows={2}
                  value={custAddress}
                  onChange={(e) => setCustAddress(e.target.value)}
                  placeholder="Street address, building, city, state, postal code..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Account Notes / Delivery Requirements</label>
                <input
                  type="text"
                  value={custNotes}
                  onChange={(e) => setCustNotes(e.target.value)}
                  placeholder="e.g. Temperature-controlled truck required. Min 6 months expiry."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              {/* Form Buttons */}
              <div className="flex items-center justify-end space-x-3 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowCreateCustomerModal(false)}
                  className="px-4 py-2 border border-slate-300 rounded-xl text-slate-700 font-bold hover:bg-slate-100 transition-all cursor-pointer"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={isSavingCust}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold shadow-sm transition-all cursor-pointer disabled:opacity-50 flex items-center space-x-1.5"
                >
                  <Check className="w-4 h-4" />
                  <span>{isSavingCust ? 'Saving Profile...' : 'Save Customer Profile'}</span>
                </button>
              </div>

            </form>

          </div>
        </div>
      )}

      {/* EDIT CUSTOMER PROFILE MODAL */}
      {showEditCustomerModal && editingCustomer && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden my-8">
            
            <div className="p-5 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Pencil className="w-5 h-5 text-indigo-400" />
                <h3 className="font-extrabold text-base">Edit Customer Profile</h3>
              </div>
              <button
                onClick={() => {
                  setShowEditCustomerModal(false);
                  setEditingCustomer(null);
                }}
                className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUpdateCustomerSubmit} className="p-6 space-y-4 text-xs font-sans">
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Company / Business Name *</label>
                  <input
                    type="text"
                    required
                    value={editCompanyName}
                    onChange={(e) => setEditCompanyName(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Customer Account Code</label>
                  <input
                    type="text"
                    value={editCode}
                    onChange={(e) => setEditCode(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg font-mono focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Contact Person Name</label>
                  <input
                    type="text"
                    value={editContactPerson}
                    onChange={(e) => setEditContactPerson(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Email Address</label>
                  <input
                    type="email"
                    value={editEmail}
                    onChange={(e) => setEditEmail(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Phone / Hotline Number</label>
                  <input
                    type="text"
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Credit Limit (RM)</label>
                  <input
                    type="number"
                    min="0"
                    step="1000"
                    value={editCreditLimit}
                    onChange={(e) => setEditCreditLimit(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg font-mono font-bold focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Payment Terms</label>
                  <select
                    value={editPaymentTerms}
                    onChange={(e) => setEditPaymentTerms(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg font-bold focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  >
                    <option value="NET 14">NET 14 Days</option>
                    <option value="NET 30">NET 30 Days</option>
                    <option value="NET 45">NET 45 Days</option>
                    <option value="NET 60">NET 60 Days</option>
                    <option value="COD">Cash on Delivery (COD)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Preferred Outbound Staging Zone</label>
                  <select
                    value={editPreferredZone}
                    onChange={(e) => setEditPreferredZone(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none font-medium"
                  >
                    <option value="Outbound Express Bay 1">Outbound Express Bay 1</option>
                    <option value="Outbound Express Bay 2">Outbound Express Bay 2</option>
                    <option value="High Velocity Staging">High Velocity Staging</option>
                    <option value="Cold Storage Bay B">Cold Storage Bay B</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Account Status</label>
                  <select
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value as 'ACTIVE' | 'INACTIVE')}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg font-bold focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  >
                    <option value="ACTIVE">ACTIVE</option>
                    <option value="INACTIVE">INACTIVE</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Delivery / HQ Address</label>
                <textarea
                  rows={2}
                  value={editAddress}
                  onChange={(e) => setEditAddress(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Account Notes / Delivery Requirements</label>
                <input
                  type="text"
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              {/* Form Buttons */}
              <div className="flex items-center justify-end space-x-3 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => {
                    setShowEditCustomerModal(false);
                    setEditingCustomer(null);
                  }}
                  className="px-4 py-2 border border-slate-300 rounded-xl text-slate-700 font-bold hover:bg-slate-100 transition-all cursor-pointer"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={isUpdatingCust}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold shadow-sm transition-all cursor-pointer disabled:opacity-50 flex items-center space-x-1.5"
                >
                  <Check className="w-4 h-4" />
                  <span>{isUpdatingCust ? 'Updating Profile...' : 'Update Customer Profile'}</span>
                </button>
              </div>

            </form>

          </div>
        </div>
      )}

      {/* CONFIRM DELETE SALES ORDER MODAL POPUP */}
      {showDeleteOrderModal && orderToDelete && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-5 bg-rose-600 text-white flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <AlertTriangle className="w-5 h-5 text-rose-200 shrink-0" />
                <h3 className="font-extrabold text-base">Delete Sales Order</h3>
              </div>
              <button
                onClick={() => {
                  setShowDeleteOrderModal(false);
                  setOrderToDelete(null);
                }}
                className="text-rose-200 hover:text-white p-1 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-xs text-slate-600 leading-relaxed font-medium">
                Are you sure you want to permanently delete this sales order?
              </p>

              <div className="bg-rose-50/80 border border-rose-200 rounded-xl p-3.5 space-y-2 text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 font-medium">Sales Order No:</span>
                  <span className="font-mono font-extrabold text-slate-900">{orderToDelete.salesOrderNo || orderToDelete.id}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 font-medium">Customer:</span>
                  <span className="font-bold text-slate-900">{orderToDelete.customerName}</span>
                </div>
                {orderToDelete.poNumber && (
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500 font-medium">Customer PO:</span>
                    <span className="font-mono font-semibold text-slate-700">{orderToDelete.poNumber}</span>
                  </div>
                )}
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 font-medium">Order Quantity:</span>
                  <span className="font-bold text-slate-900">
                    {orderToDelete.totalOrderCtn || orderToDelete.items?.reduce((s, i) => s + (i.orderQtyCtn || i.requestedQty || 0), 0)} CTN
                  </span>
                </div>
              </div>

              <div className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 p-3 rounded-xl flex items-start gap-2 leading-relaxed">
                <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
                <span>This action cannot be undone. Reserved inventory stock allocations for this order will be released back to warehouse stock.</span>
              </div>

              <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => {
                    setShowDeleteOrderModal(false);
                    setOrderToDelete(null);
                  }}
                  className="px-4 py-2 border border-slate-300 rounded-xl text-xs text-slate-700 font-bold hover:bg-slate-100 transition-all cursor-pointer"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  disabled={isDeletingOrder}
                  onClick={handleConfirmDeleteOrder}
                  className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shadow-sm transition-all cursor-pointer disabled:opacity-50 flex items-center space-x-1.5"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>{isDeletingOrder ? 'Deleting Order...' : 'Confirm & Delete'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRM DELETE CUSTOMER PROFILE MODAL POPUP */}
      {showDeleteCustomerModal && customerToDelete && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-5 bg-rose-600 text-white flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <AlertTriangle className="w-5 h-5 text-rose-200 shrink-0" />
                <h3 className="font-extrabold text-base">Delete Customer Profile</h3>
              </div>
              <button
                onClick={() => {
                  setShowDeleteCustomerModal(false);
                  setCustomerToDelete(null);
                }}
                className="text-rose-200 hover:text-white p-1 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-xs text-slate-600 leading-relaxed font-medium">
                Are you sure you want to permanently delete this customer profile from the system?
              </p>

              <div className="bg-rose-50/80 border border-rose-200 rounded-xl p-3.5 space-y-2 text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 font-medium">Customer Name:</span>
                  <span className="font-bold text-slate-900">{customerToDelete.companyName}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 font-medium">Customer Code:</span>
                  <span className="font-mono font-extrabold text-slate-900">{customerToDelete.customerCode || customerToDelete.id}</span>
                </div>
                {customerToDelete.contactPerson && (
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500 font-medium">Contact:</span>
                    <span className="font-semibold text-slate-700">{customerToDelete.contactPerson}</span>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => {
                    setShowDeleteCustomerModal(false);
                    setCustomerToDelete(null);
                  }}
                  className="px-4 py-2 border border-slate-300 rounded-xl text-xs text-slate-700 font-bold hover:bg-slate-100 transition-all cursor-pointer"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  disabled={isDeletingCustomer}
                  onClick={handleConfirmDeleteCustomer}
                  className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shadow-sm transition-all cursor-pointer disabled:opacity-50 flex items-center space-x-1.5"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>{isDeletingCustomer ? 'Deleting Customer...' : 'Confirm & Delete'}</span>
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
          setOutboundToast(msg || 'Stock out deduction completed successfully.');
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
