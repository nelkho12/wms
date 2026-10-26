import React, { useState } from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  UserCheck,
  X,
  CheckCircle2,
  XCircle,
  Key,
  Users,
  Settings,
  Lock,
  Unlock,
  Building2,
  Sparkles,
  Award,
  AlertTriangle,
  UserPlus,
  Edit3,
  Trash2,
  Mail,
  User,
  Clock,
  IdCard,
  RotateCcw
} from 'lucide-react';
import {
  UserRole,
  UserProfile,
  WmsPermission,
  ROLE_DEFINITIONS,
  INITIAL_USERS,
  hasPermission
} from '../types/roles';

interface RoleManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserProfile;
  onSwitchUser: (user: UserProfile) => void;
  usersList: UserProfile[];
  onUpdateUserRole: (userId: string, newRole: UserRole) => void;
  onCreateUser?: (userData: {
    name: string;
    email: string;
    role: UserRole;
    department?: string;
    shift?: string;
    badgeCode?: string;
  }) => Promise<UserProfile | void>;
  onEditUserProfile?: (id: string, updates: Partial<UserProfile>) => Promise<UserProfile | void>;
  onDeleteUser?: (id: string) => Promise<void>;
  enableSafetyReorder?: boolean;
  onToggleSafetyReorder?: (enabled: boolean) => void;
  enableInboundSupplier?: boolean;
  onToggleInboundSupplier?: (enabled: boolean) => void;
  customRolePermissions?: Record<UserRole, WmsPermission[]>;
  onToggleRolePermission?: (role: UserRole, permission: WmsPermission) => void;
  onResetRolePermissions?: () => void;
}

const ALL_PERMISSIONS: Array<{ key: WmsPermission; label: string; group: string; description: string }> = [
  { key: 'inventory:read', label: 'View Inventory', group: 'Inventory', description: 'View SKUs, bin stock levels & location layouts' },
  { key: 'inventory:write', label: 'Modify Stock & SKUs', group: 'Inventory', description: 'Create/edit SKUs & perform manual stock adjustments' },
  { key: 'inbound:receive', label: 'Inbound Goods Receipt', group: 'Inbound', description: 'Process inbound supplier deliveries & putaway stock' },
  { key: 'traceability:view', label: 'Lot Lineage & Expiry', group: 'Quality', description: 'View end-to-end batch genealogy & BBD tracking' },
  { key: 'quarantine:manage', label: 'Quarantine & Recalls', group: 'Quality', description: 'Lock/release batch quarantine holds & issue emergency recalls' },
  { key: 'orders:view', label: 'View Outbound Orders', group: 'Fulfillment', description: 'View customer pick orders & status' },
  { key: 'orders:pick', label: 'Execute Pick Walks', group: 'Fulfillment', description: 'Run FEFO pick routes & confirm mobile pick steps' },
  { key: 'orders:manage', label: 'Manage Orders & Allocate', group: 'Fulfillment', description: 'Create, prioritize & optimize pick order allocations' },
  { key: 'mssql:console', label: 'MS SQL Server Console', group: 'System', description: 'Execute raw T-SQL queries & inspect database schemas' },
  { key: 'settings:manage', label: 'RBAC & System Config', group: 'System', description: 'Modify role permissions & system security controls' }
];

export const RoleManagementModal: React.FC<RoleManagementModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  onSwitchUser,
  usersList,
  onUpdateUserRole,
  onCreateUser,
  onEditUserProfile,
  onDeleteUser,
  enableSafetyReorder = true,
  onToggleSafetyReorder,
  enableInboundSupplier = true,
  onToggleInboundSupplier,
  customRolePermissions,
  onToggleRolePermission,
  onResetRolePermissions
}) => {
  const [activeTab, setActiveTab] = useState<'switch' | 'matrix' | 'users'>('switch');

  // Create User state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createEmail, setCreateEmail] = useState('');
  const [createRole, setCreateRole] = useState<UserRole>('Warehouse Manager');
  const [createDept, setCreateDept] = useState('Warehouse Floor Operations');
  const [createShift, setCreateShift] = useState('First Shift (07:00 - 15:30)');
  const [createBadge, setCreateBadge] = useState('');
  const [isSubmittingCreate, setIsSubmittingCreate] = useState(false);

  // Edit User state
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editRole, setEditRole] = useState<UserRole>('Warehouse Manager');
  const [editDept, setEditDept] = useState('');
  const [editShift, setEditShift] = useState('');
  const [editBadge, setEditBadge] = useState('');
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);

  // Delete User Confirmation state
  const [userToDelete, setUserToDelete] = useState<UserProfile | null>(null);
  const [showDeleteUserModal, setShowDeleteUserModal] = useState(false);
  const [isSubmittingDelete, setIsSubmittingDelete] = useState(false);

  // Toast feedback
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  };

  const handleOpenCreateModal = () => {
    setCreateName('');
    setCreateEmail('');
    setCreateRole('Warehouse Manager');
    setCreateDept('Warehouse Floor Operations');
    setCreateShift('First Shift (07:00 - 15:30)');
    setCreateBadge(`BDG-${Math.floor(1000 + Math.random() * 9000)}`);
    setShowCreateModal(true);
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createName.trim() || !createEmail.trim()) return;

    setIsSubmittingCreate(true);
    try {
      if (onCreateUser) {
        await onCreateUser({
          name: createName,
          email: createEmail,
          role: createRole,
          department: createDept,
          shift: createShift,
          badgeCode: createBadge
        });
      }
      showToast(`✅ Created team member profile for '${createName}'`);
      setShowCreateModal(false);
    } catch (err: any) {
      alert(`Failed to create team member profile: ${err.message}`);
    } finally {
      setIsSubmittingCreate(false);
    }
  };

  const handleOpenEditModal = (user: UserProfile) => {
    setEditingUser(user);
    setEditName(user.name);
    setEditEmail(user.email);
    setEditRole(user.role);
    setEditDept(user.department || '');
    setEditShift(user.shift || '');
    setEditBadge(user.badgeCode || '');
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser || !editName.trim() || !editEmail.trim()) return;

    setIsSubmittingEdit(true);
    try {
      if (onEditUserProfile) {
        await onEditUserProfile(editingUser.id, {
          name: editName,
          email: editEmail,
          role: editRole,
          department: editDept,
          shift: editShift,
          badgeCode: editBadge
        });
      }
      showToast(`✅ Updated team member profile for '${editName}'`);
      setEditingUser(null);
    } catch (err: any) {
      alert(`Failed to update profile: ${err.message}`);
    } finally {
      setIsSubmittingEdit(false);
    }
  };

  const handleDeleteUserClick = (user: UserProfile) => {
    if (user.id === currentUser.id) {
      alert('You cannot delete your active user profile.');
      return;
    }
    if (usersList.length <= 1) {
      alert('Cannot delete the last remaining user in the system.');
      return;
    }

    setUserToDelete(user);
    setShowDeleteUserModal(true);
  };

  const handleConfirmDeleteUser = async () => {
    if (!userToDelete) return;
    setIsSubmittingDelete(true);
    try {
      if (onDeleteUser) {
        await onDeleteUser(userToDelete.id);
      }
      showToast(`✅ Removed team member profile '${userToDelete.name}'`);
      setShowDeleteUserModal(false);
      setUserToDelete(null);
    } catch (err: any) {
      alert(`Failed to delete profile: ${err.message}`);
    } finally {
      setIsSubmittingDelete(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white border border-slate-200 rounded-3xl max-w-4xl w-full p-6 shadow-2xl space-y-6 relative my-8 text-slate-900">
        
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 text-slate-400 hover:text-slate-700 p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header Banner */}
        <div className="flex items-center space-x-3">
          <div className="p-3 bg-gradient-to-tr from-blue-600 to-indigo-600 rounded-2xl text-white shadow-lg">
            <ShieldCheck className="w-7 h-7" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h3 className="font-black text-slate-900 text-xl">
                WMS Role-Based Access Control (RBAC) & Security
              </h3>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-blue-100 text-blue-800 border border-blue-200">
                Active Role: {currentUser.role}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Manage user roles, permissions matrix, and profile switching for testing operational authorization boundaries.
            </p>
          </div>
        </div>

        {/* Sub-tab Navigation */}
        <div className="flex border-b border-slate-200 text-xs font-bold space-x-2">
          <button
            onClick={() => setActiveTab('switch')}
            className={`py-2.5 px-4 rounded-t-xl transition-all cursor-pointer flex items-center space-x-2 ${
              activeTab === 'switch'
                ? 'bg-slate-100 text-slate-900 border-t-2 border-blue-600 font-black'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <UserCheck className="w-4 h-4 text-blue-600" />
            <span>Switch Active Profile / Test Role</span>
          </button>

          <button
            onClick={() => setActiveTab('matrix')}
            className={`py-2.5 px-4 rounded-t-xl transition-all cursor-pointer flex items-center space-x-2 ${
              activeTab === 'matrix'
                ? 'bg-slate-100 text-slate-900 border-t-2 border-blue-600 font-black'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <Key className="w-4 h-4 text-amber-600" />
            <span>Role Permissions Matrix</span>
          </button>

          <button
            onClick={() => setActiveTab('users')}
            className={`py-2.5 px-4 rounded-t-xl transition-all cursor-pointer flex items-center space-x-2 ${
              activeTab === 'users'
                ? 'bg-slate-100 text-slate-900 border-t-2 border-blue-600 font-black'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <Users className="w-4 h-4 text-emerald-600" />
            <span>User Directory & Role Assignment</span>
          </button>
        </div>

        {/* TAB 1: QUICK SWITCH PROFILES */}
        {activeTab === 'switch' && (
          <div className="space-y-4">
            {/* Optional Feature Toggles (Admin Controlled Ticketed Functions) */}
            {(onToggleSafetyReorder || onToggleInboundSupplier) && (
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl shadow-xs space-y-3">
                <h4 className="font-extrabold text-slate-900 text-sm flex items-center space-x-2">
                  <ShieldAlert className="w-4 h-4 text-purple-600" />
                  <span>Admin Ticketed Functions (Optional Features)</span>
                </h4>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {/* Toggle 1: Safety Reorder Levels */}
                  {onToggleSafetyReorder && (
                    <div className="p-3 bg-white border border-amber-200 rounded-xl space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-800 text-xs">Safety Reorder Levels</span>
                        <input
                          type="checkbox"
                          checked={enableSafetyReorder}
                          onChange={(e) => onToggleSafetyReorder(e.target.checked)}
                          className="w-4 h-4 text-amber-600 rounded border-slate-300 focus:ring-amber-500 cursor-pointer"
                        />
                      </div>
                      <p className="text-[11px] text-slate-500 leading-tight">
                        Alert threshold metrics & replenishment recommendations for low-stock SKUs.
                      </p>
                      <div className="text-[11px] font-mono font-bold text-amber-800">
                        Status: {enableSafetyReorder ? 'Ticked (Enabled)' : 'Unticked (Disabled)'}
                      </div>
                    </div>
                  )}

                  {/* Toggle 2: Incoming Stock Supplier/Vendor Info */}
                  {onToggleInboundSupplier && (
                    <div className="p-3 bg-white border border-blue-200 rounded-xl space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-800 text-xs">Incoming Stock Supplier/Vendor Info</span>
                        <input
                          type="checkbox"
                          checked={enableInboundSupplier}
                          onChange={(e) => onToggleInboundSupplier(e.target.checked)}
                          className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500 cursor-pointer"
                        />
                      </div>
                      <p className="text-[11px] text-slate-500 leading-tight">
                        Record and mandate supplier/vendor origin details on incoming stock receipts & POs.
                      </p>
                      <div className="text-[11px] font-mono font-bold text-blue-800">
                        Status: {enableInboundSupplier ? 'Ticked (Enabled)' : 'Unticked (Disabled)'}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs text-slate-700 flex items-center space-x-3">
              <Sparkles className="w-5 h-5 text-amber-600 flex-shrink-0" />
              <span>
                <strong>Instant Role Simulator:</strong> Click any user profile below to immediately adopt their role and test functional permission constraints in real time.
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {usersList.map((user) => {
                const isCurrent = user.id === currentUser.id;
                const roleDef = ROLE_DEFINITIONS[user.role];

                return (
                  <div
                    key={user.id}
                    onClick={() => onSwitchUser(user)}
                    className={`p-4 rounded-2xl border-2 transition-all cursor-pointer space-y-3 relative overflow-hidden ${
                      isCurrent
                        ? 'bg-blue-50/50 border-blue-600 shadow-sm'
                        : 'bg-slate-50 border-slate-200 hover:border-slate-300 hover:bg-white'
                    }`}
                  >
                    {isCurrent && (
                      <div className="absolute top-3 right-3 px-2 py-0.5 bg-blue-600 text-white text-[10px] font-black rounded-md uppercase tracking-wider">
                        Active User
                      </div>
                    )}

                    <div className="flex items-center space-x-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm text-white ${
                        user.role === 'Admin'
                          ? 'bg-rose-600'
                          : user.role === 'Warehouse Manager'
                          ? 'bg-blue-600'
                          : user.role === 'Picker'
                          ? 'bg-amber-600'
                          : 'bg-emerald-600'
                      }`}>
                        {user.name.split(' ').map((n) => n[0]).join('')}
                      </div>

                      <div>
                        <h4 className="font-bold text-slate-900 text-base">{user.name}</h4>
                        <p className="text-xs text-slate-500 font-mono">{user.email}</p>
                      </div>
                    </div>

                    <div className="space-y-1.5 pt-2 border-t border-slate-200 text-xs font-mono">
                      <div className="flex justify-between items-center">
                        <span className="text-slate-500">Assigned Role:</span>
                        <span className={`px-2 py-0.5 rounded font-bold text-[11px] ${
                          user.role === 'Admin'
                            ? 'bg-rose-100 text-rose-800 border border-rose-200'
                            : user.role === 'Warehouse Manager'
                            ? 'bg-blue-100 text-blue-800 border border-blue-200'
                            : user.role === 'Picker'
                            ? 'bg-amber-100 text-amber-800 border border-amber-200'
                            : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                        }`}>
                          {user.role}
                        </span>
                      </div>

                      <div className="flex justify-between">
                        <span className="text-slate-500">Department:</span>
                        <span className="text-slate-800 font-semibold">{user.department}</span>
                      </div>

                      <div className="flex justify-between">
                        <span className="text-slate-500">Shift / Badge:</span>
                        <span className="text-slate-800 font-semibold">{user.shift.split(' ')[0]} ({user.badgeCode})</span>
                      </div>
                    </div>

                    <p className="text-xs text-slate-500 italic pt-1 border-t border-slate-200 leading-relaxed">
                      "{roleDef?.description}"
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB 2: PERMISSIONS MATRIX */}
        {activeTab === 'matrix' && (
          <div className="space-y-4">
            {/* Security Control Header Banner */}
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center space-x-3">
                <div className={`p-2.5 rounded-xl text-white shadow-xs ${
                  currentUser.role === 'Admin' ? 'bg-rose-600' : 'bg-slate-600'
                }`}>
                  {currentUser.role === 'Admin' ? (
                    <Edit3 className="w-5 h-5" />
                  ) : (
                    <Lock className="w-5 h-5" />
                  )}
                </div>
                <div>
                  <h4 className="font-extrabold text-slate-900 text-sm flex items-center space-x-2">
                    <span>Role Permission Security Matrix</span>
                    {currentUser.role === 'Admin' ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-900 border border-emerald-300">
                        Admin Editing Active
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-slate-200 text-slate-700">
                        Read-Only Mode
                      </span>
                    )}
                  </h4>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {currentUser.role === 'Admin'
                      ? 'As an Admin, click any ALLOWED / DENIED cell in the matrix below to toggle or edit capabilities for any role in real time.'
                      : 'Log in as System Administrator (Admin) to edit role capabilities in this matrix.'}
                  </p>
                </div>
              </div>

              {currentUser.role === 'Admin' && onResetRolePermissions && (
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm('Reset all role permissions to factory WMS defaults?')) {
                      onResetRolePermissions();
                      showToast('🔄 Reset Role Permission Matrix to factory defaults');
                    }
                  }}
                  className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-xl text-xs font-bold transition-all flex items-center space-x-1.5 cursor-pointer shrink-0"
                  title="Reset to original WMS role permission matrix"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-slate-600" />
                  <span>Reset Defaults</span>
                </button>
              )}
            </div>

            {/* Matrix Data Table */}
            <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-xs">
              <table className="w-full text-left text-xs font-mono">
                <thead className="bg-slate-100 text-slate-700 uppercase border-b border-slate-200">
                  <tr>
                    <th className="py-3.5 px-4 font-bold">WMS Capability</th>
                    {(['Admin', 'Warehouse Manager', 'Picker', 'Receiver'] as UserRole[]).map((r) => {
                      const rolesList = customRolePermissions ? customRolePermissions[r] || [] : ROLE_DEFINITIONS[r]?.permissions || [];
                      const count = rolesList.length;
                      return (
                        <th key={r} className="py-3.5 px-3 text-center">
                          <div className={`font-extrabold text-xs ${
                            r === 'Admin'
                              ? 'text-rose-700'
                              : r === 'Warehouse Manager'
                              ? 'text-blue-700'
                              : r === 'Picker'
                              ? 'text-amber-700'
                              : 'text-emerald-700'
                          }`}>
                            {r}
                          </div>
                          <div className="text-[10px] text-slate-500 font-sans font-normal lowercase mt-0.5">
                            ({count}/{ALL_PERMISSIONS.length} granted)
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {ALL_PERMISSIONS.map((perm) => (
                    <tr key={perm.key} className="hover:bg-purple-50/20 transition-colors">
                      <td className="py-3 px-4">
                        <div className="flex items-center space-x-2">
                          <span className="font-bold text-slate-900 text-xs">{perm.label}</span>
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-slate-100 text-slate-600 border border-slate-200">
                            {perm.group}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 font-sans mt-0.5">{perm.description}</div>
                      </td>

                      {(['Admin', 'Warehouse Manager', 'Picker', 'Receiver'] as UserRole[]).map((r) => {
                        const allowed = hasPermission(r, perm.key, customRolePermissions);
                        const isAdmin = currentUser.role === 'Admin';

                        if (isAdmin && onToggleRolePermission) {
                          return (
                            <td key={r} className="py-3 px-3 text-center">
                              <button
                                type="button"
                                onClick={() => {
                                  onToggleRolePermission(r, perm.key);
                                  showToast(
                                    `${!allowed ? '✅ Granted' : '⚠️ Revoked'} '${perm.label}' ${!allowed ? 'to' : 'from'} ${r}`
                                  );
                                }}
                                className={`inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer border group shadow-2xs ${
                                  allowed
                                    ? 'bg-emerald-100 hover:bg-rose-100 text-emerald-900 hover:text-rose-800 border-emerald-300 hover:border-rose-300'
                                    : 'bg-slate-100 hover:bg-emerald-100 text-slate-500 hover:text-emerald-900 border-slate-200 hover:border-emerald-300'
                                }`}
                                title={`Click to ${allowed ? 'revoke' : 'grant'} '${perm.label}' permission for role '${r}'`}
                              >
                                {allowed ? (
                                  <>
                                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 group-hover:text-rose-600" />
                                    <span>ALLOWED</span>
                                  </>
                                ) : (
                                  <>
                                    <XCircle className="w-3.5 h-3.5 text-slate-400 group-hover:text-emerald-600" />
                                    <span>DENIED</span>
                                  </>
                                )}
                              </button>
                            </td>
                          );
                        }

                        return (
                          <td key={r} className="py-3 px-3 text-center">
                            {allowed ? (
                              <span className="inline-flex items-center space-x-1 text-emerald-800 font-bold bg-emerald-100 px-2.5 py-1 rounded-xl border border-emerald-300">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                <span className="text-[10px]">ALLOWED</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center space-x-1 text-slate-400 bg-slate-100 px-2.5 py-1 rounded-xl border border-slate-200">
                                <XCircle className="w-3.5 h-3.5 text-slate-400" />
                                <span className="text-[10px]">DENIED</span>
                              </span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Toast Notification */}
        {toast && (
          <div className="bg-emerald-600 text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-lg flex items-center justify-between">
            <span>{toast}</span>
            <button onClick={() => setToast(null)} className="text-white hover:text-emerald-100">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* TAB 3: USER DIRECTORY & ROLE ASSIGNMENT */}
        {activeTab === 'users' && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50 border border-slate-200 p-3.5 rounded-2xl">
              <div>
                <h4 className="font-bold text-slate-900 text-sm">Team Member Profiles ({usersList.length})</h4>
                <p className="text-xs text-slate-500">
                  Create, update, or remove team member accounts and manage active role permissions across WMS modules.
                </p>
              </div>
              <button
                onClick={handleOpenCreateModal}
                className="flex items-center justify-center space-x-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer shrink-0"
              >
                <UserPlus className="w-4 h-4" />
                <span>Add New Team Member</span>
              </button>
            </div>

            <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
              {usersList.map((user) => {
                const isCurrent = user.id === currentUser.id;
                return (
                  <div
                    key={user.id}
                    className={`p-4 border rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all ${
                      isCurrent ? 'bg-blue-50/40 border-blue-300' : 'bg-white border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-start space-x-3">
                      <div className={`w-11 h-11 rounded-xl flex items-center justify-center font-bold text-sm text-white shrink-0 shadow-xs ${
                        user.role === 'Admin'
                          ? 'bg-rose-600'
                          : user.role === 'Warehouse Manager'
                          ? 'bg-blue-600'
                          : user.role === 'Picker'
                          ? 'bg-amber-600'
                          : 'bg-emerald-600'
                      }`}>
                        {user.name.split(' ').map((n) => n[0]).join('')}
                      </div>

                      <div className="space-y-1">
                        <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                          <span className="font-bold text-slate-900 text-sm">{user.name}</span>
                          <span className="text-xs font-mono px-2 py-0.5 bg-slate-100 border border-slate-200 rounded-md text-slate-600">
                            {user.badgeCode}
                          </span>
                          {isCurrent && (
                            <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-blue-600 text-white rounded-md">
                              Active Session
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 font-mono">{user.email}</p>
                        <div className="flex items-center space-x-3 text-[11px] text-slate-600 font-sans pt-0.5">
                          <span><strong>Dept:</strong> {user.department}</span>
                          <span>•</span>
                          <span><strong>Shift:</strong> {user.shift}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2 shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-slate-100">
                      <div className="flex items-center space-x-1.5 mr-2">
                        <label className="text-[11px] font-semibold text-slate-500 hidden sm:inline">Role:</label>
                        <select
                          value={user.role}
                          onChange={(e) => onUpdateUserRole(user.id, e.target.value as UserRole)}
                          className="bg-slate-50 border border-slate-300 rounded-xl px-2.5 py-1.5 text-xs font-bold font-mono text-slate-900 focus:outline-none focus:border-blue-500 cursor-pointer"
                        >
                          <option value="Admin">Admin</option>
                          <option value="Warehouse Manager">Warehouse Manager</option>
                          <option value="Picker">Picker</option>
                          <option value="Receiver">Receiver</option>
                        </select>
                      </div>

                      <button
                        onClick={() => handleOpenEditModal(user)}
                        className="flex items-center space-x-1 px-3 py-1.5 bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-700 border border-slate-300 hover:border-blue-300 rounded-xl text-xs font-bold transition-all cursor-pointer"
                        title="Edit profile details"
                      >
                        <Edit3 className="w-3.5 h-3.5 text-blue-600" />
                        <span>Edit</span>
                      </button>

                      <button
                        onClick={() => handleDeleteUserClick(user)}
                        disabled={isCurrent || usersList.length <= 1}
                        className={`p-1.5 border rounded-xl text-xs font-bold transition-all cursor-pointer ${
                          isCurrent || usersList.length <= 1
                            ? 'bg-slate-100 text-slate-300 border-slate-200 cursor-not-allowed'
                            : 'bg-rose-50 hover:bg-rose-100 text-rose-700 border-rose-200'
                        }`}
                        title={isCurrent ? 'Cannot delete current active session user' : 'Delete team member profile'}
                      >
                        <Trash2 className="w-4 h-4 text-rose-600" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex justify-end pt-2 border-t border-slate-200">
          <button
            onClick={onClose}
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl shadow-xs cursor-pointer"
          >
            Close Security Matrix
          </button>
        </div>

      </div>

      {/* CREATE NEW TEAM MEMBER MODAL OVERLAY */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-lg w-full p-6 shadow-2xl relative text-slate-900 space-y-5">
            <button
              onClick={() => setShowCreateModal(false)}
              className="absolute top-5 right-5 text-slate-400 hover:text-slate-700 p-1.5 rounded-xl bg-slate-100"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center space-x-3">
              <div className="p-3 bg-purple-100 border border-purple-200 rounded-2xl text-purple-600">
                <UserPlus className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-extrabold text-slate-900 text-lg">Create Team Member Profile</h3>
                <p className="text-xs text-slate-500">
                  Register a new staff profile for system access and role assignment
                </p>
              </div>
            </div>

            <form onSubmit={handleCreateSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Full Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Rachel Adams"
                    value={createName}
                    onChange={(e) => setCreateName(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs text-slate-900 font-semibold focus:bg-white focus:outline-none focus:border-purple-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Email Address *</label>
                  <input
                    type="email"
                    required
                    placeholder="r.adams@apexwms.io"
                    value={createEmail}
                    onChange={(e) => setCreateEmail(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs text-slate-900 font-semibold focus:bg-white focus:outline-none focus:border-purple-600"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Assigned WMS Role *</label>
                  <select
                    value={createRole}
                    onChange={(e) => setCreateRole(e.target.value as UserRole)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs text-slate-900 font-bold focus:bg-white focus:outline-none focus:border-purple-600"
                  >
                    <option value="Admin">Admin</option>
                    <option value="Warehouse Manager">Warehouse Manager</option>
                    <option value="Picker">Picker</option>
                    <option value="Receiver">Receiver</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Badge Code</label>
                  <input
                    type="text"
                    placeholder="BDG-5510"
                    value={createBadge}
                    onChange={(e) => setCreateBadge(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs text-slate-900 font-mono focus:bg-white focus:outline-none focus:border-purple-600"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Department</label>
                <input
                  type="text"
                  placeholder="e.g. Inbound Dock & Receiving"
                  value={createDept}
                  onChange={(e) => setCreateDept(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-purple-600"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Shift Hours</label>
                <input
                  type="text"
                  placeholder="First Shift (07:00 - 15:30)"
                  value={createShift}
                  onChange={(e) => setCreateShift(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-purple-600"
                />
              </div>

              <div className="pt-3 border-t border-slate-200 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingCreate}
                  className="px-5 py-2 bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold rounded-xl shadow-xs cursor-pointer"
                >
                  {isSubmittingCreate ? 'Creating Profile...' : 'Save New Profile'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT TEAM MEMBER PROFILE MODAL OVERLAY */}
      {editingUser && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-lg w-full p-6 shadow-2xl relative text-slate-900 space-y-5">
            <button
              onClick={() => setEditingUser(null)}
              className="absolute top-5 right-5 text-slate-400 hover:text-slate-700 p-1.5 rounded-xl bg-slate-100"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center space-x-3">
              <div className="p-3 bg-blue-100 border border-blue-200 rounded-2xl text-blue-600">
                <Edit3 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-extrabold text-slate-900 text-lg">Edit Team Member Profile</h3>
                <p className="text-xs text-slate-500">
                  Update profile information, department, shift, and role permissions for {editingUser.name}
                </p>
              </div>
            </div>

            <form onSubmit={handleEditSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Full Name *</label>
                  <input
                    type="text"
                    required
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs text-slate-900 font-semibold focus:bg-white focus:outline-none focus:border-blue-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Email Address *</label>
                  <input
                    type="email"
                    required
                    value={editEmail}
                    onChange={(e) => setEditEmail(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs text-slate-900 font-semibold focus:bg-white focus:outline-none focus:border-blue-600"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Assigned Role *</label>
                  <select
                    value={editRole}
                    onChange={(e) => setEditRole(e.target.value as UserRole)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs text-slate-900 font-bold focus:bg-white focus:outline-none focus:border-blue-600"
                  >
                    <option value="Admin">Admin</option>
                    <option value="Warehouse Manager">Warehouse Manager</option>
                    <option value="Picker">Picker</option>
                    <option value="Receiver">Receiver</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Badge Code</label>
                  <input
                    type="text"
                    value={editBadge}
                    onChange={(e) => setEditBadge(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs text-slate-900 font-mono focus:bg-white focus:outline-none focus:border-blue-600"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Department</label>
                <input
                  type="text"
                  value={editDept}
                  onChange={(e) => setEditDept(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-blue-600"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Shift Hours</label>
                <input
                  type="text"
                  value={editShift}
                  onChange={(e) => setEditShift(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-blue-600"
                />
              </div>

              <div className="pt-3 border-t border-slate-200 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingEdit}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl shadow-xs cursor-pointer"
                >
                  {isSubmittingEdit ? 'Saving Changes...' : 'Save Profile Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete User Confirmation Modal */}
      {showDeleteUserModal && userToDelete && (
        <div className="fixed inset-0 z-[60] bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-5 bg-rose-600 text-white flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <AlertTriangle className="w-5 h-5 text-rose-200 shrink-0" />
                <h3 className="font-extrabold text-base">Delete Team Member Profile</h3>
              </div>
              <button
                onClick={() => {
                  setShowDeleteUserModal(false);
                  setUserToDelete(null);
                }}
                className="text-rose-200 hover:text-white p-1 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-xs text-slate-600 leading-relaxed font-medium">
                Are you sure you want to permanently delete this team member profile from the system?
              </p>

              <div className="bg-rose-50/80 border border-rose-200 rounded-xl p-3.5 space-y-2 text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 font-medium">Name:</span>
                  <span className="font-bold text-slate-900">{userToDelete.name}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 font-medium">Email:</span>
                  <span className="font-mono text-slate-800">{userToDelete.email}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 font-medium">Role:</span>
                  <span className="font-semibold text-slate-900">{userToDelete.role}</span>
                </div>
                {userToDelete.department && (
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500 font-medium">Department:</span>
                    <span className="text-slate-700">{userToDelete.department}</span>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => {
                    setShowDeleteUserModal(false);
                    setUserToDelete(null);
                  }}
                  className="px-4 py-2 border border-slate-300 rounded-xl text-xs text-slate-700 font-bold hover:bg-slate-100 transition-all cursor-pointer"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  disabled={isSubmittingDelete}
                  onClick={handleConfirmDeleteUser}
                  className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shadow-sm transition-all cursor-pointer disabled:opacity-50 flex items-center space-x-1.5"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>{isSubmittingDelete ? 'Deleting Profile...' : 'Confirm & Delete'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
