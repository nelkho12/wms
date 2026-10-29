import React, { useState } from 'react';
import {
  User,
  Mail,
  ShieldCheck,
  Building2,
  Clock,
  IdCard,
  X,
  CheckCircle2,
  Edit3,
  LogOut,
  Key,
  Save,
  Activity,
  Award,
  Check,
  AlertCircle
} from 'lucide-react';
import { UserProfile, UserRole, WmsPermission, ROLE_DEFINITIONS, AuditLogEntry, hasPermission } from '../types/roles';
import { changeMyPassword } from '../services/api';

interface UserProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserProfile;
  onEditUserProfile?: (id: string, updates: Partial<UserProfile> & { password?: string }) => Promise<UserProfile | void>;
  onLogout: () => void;
  onOpenSwitchUserModal: () => void;
  auditLogs?: AuditLogEntry[];
  customRolePermissions?: Record<UserRole, WmsPermission[]>;
}

export const UserProfileModal: React.FC<UserProfileModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  onEditUserProfile,
  onLogout,
  onOpenSwitchUserModal,
  auditLogs = [],
  customRolePermissions
}) => {
  const [activeTab, setActiveTab] = useState<'info' | 'edit' | 'permissions' | 'activity'>('info');

  // Edit profile form state
  const [editName, setEditName] = useState(currentUser.name);
  const [editEmail, setEditEmail] = useState(currentUser.email);
  const [editDept, setEditDept] = useState(currentUser.department || '');
  const [editShift, setEditShift] = useState(currentUser.shift || '');
  const [editBadge, setEditBadge] = useState(currentUser.badgeCode || '');
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Change password form state
  const [curPw, setCurPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [newPw2, setNewPw2] = useState('');
  const [pwMessage, setPwMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pwBusy, setPwBusy] = useState(false);

  const submitPasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwMessage(null);
    if (newPw.length < 8) return setPwMessage({ ok: false, text: 'The new password must be at least 8 characters.' });
    if (newPw !== newPw2) return setPwMessage({ ok: false, text: 'The two new passwords are not the same.' });
    setPwBusy(true);
    try {
      await changeMyPassword(curPw, newPw);
      setPwMessage({ ok: true, text: 'Password changed.' });
      setCurPw('');
      setNewPw('');
      setNewPw2('');
    } catch (err: any) {
      setPwMessage({ ok: false, text: err.message });
    } finally {
      setPwBusy(false);
    }
  };

  if (!isOpen) return null;

  const roleDef = ROLE_DEFINITIONS[currentUser.role] || ROLE_DEFINITIONS['Admin'];

  // User's recent audit activity
  const userActivities = auditLogs.filter(
    (log) => log.userId === currentUser.id || log.userName === currentUser.name
  ).slice(0, 10);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editName.trim() || !editEmail.trim()) return;

    setIsSaving(true);
    setSaveSuccess(false);

    try {
      if (onEditUserProfile) {
        await onEditUserProfile(currentUser.id, {
          name: editName.trim(),
          email: editEmail.trim(),
          department: editDept.trim(),
          shift: editShift.trim(),
          badgeCode: editBadge.trim()
        });
      }
      setSaveSuccess(true);
      setTimeout(() => {
        setSaveSuccess(false);
        setActiveTab('info');
      }, 1200);
    } catch (err) {
      console.error('Failed to update profile:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const roleBadgeStyle =
    currentUser.role === 'Admin'
      ? 'bg-rose-100 text-rose-800 border-rose-300'
      : currentUser.role === 'Warehouse Manager'
      ? 'bg-blue-100 text-blue-800 border-blue-300'
      : currentUser.role === 'Picker'
      ? 'bg-amber-100 text-amber-800 border-amber-300'
      : 'bg-emerald-100 text-emerald-800 border-emerald-300';

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden my-6 animate-in fade-in zoom-in-95 duration-150">
        
        {/* Header Bar */}
        <div className="p-5 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-indigo-500/20 border border-indigo-400/30 rounded-xl">
              <User className="w-5 h-5 text-indigo-300" />
            </div>
            <div>
              <h3 className="font-extrabold text-base tracking-tight">User Profile & Account Information</h3>
              <p className="text-[11px] text-slate-300">Logged in via ApexWMS Security Authentication</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1.5 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* User Profile Card Banner */}
        <div className="p-6 bg-slate-50 border-b border-slate-200">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center space-x-4">
              {/* Avatar circle */}
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-600 via-blue-600 to-slate-800 text-white font-extrabold text-xl flex items-center justify-center shadow-md border-2 border-white ring-2 ring-indigo-500/20 shrink-0">
                {currentUser.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()}
              </div>

              <div>
                <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                  <h2 className="text-lg font-black text-slate-900">{currentUser.name}</h2>
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-mono font-extrabold border ${roleBadgeStyle}`}>
                    {currentUser.role}
                  </span>
                </div>
                <p className="text-xs text-slate-500 flex items-center mt-0.5 font-medium">
                  <Mail className="w-3.5 h-3.5 mr-1 text-slate-400" />
                  {currentUser.email}
                </p>
                <div className="flex items-center space-x-3 text-[11px] text-slate-600 mt-1.5">
                  <span className="flex items-center font-mono font-bold bg-white px-2 py-0.5 rounded border border-slate-200">
                    <IdCard className="w-3 h-3 mr-1 text-indigo-600" />
                    {currentUser.badgeCode || 'NO-BADGE'}
                  </span>
                  <span className="flex items-center text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 mr-1.5 animate-pulse" />
                    Active Session
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center space-x-2 shrink-0 self-end sm:self-center">
              <button
                onClick={() => setActiveTab(activeTab === 'edit' ? 'info' : 'edit')}
                className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 font-bold rounded-xl text-xs flex items-center space-x-1.5 transition-all shadow-xs cursor-pointer"
              >
                <Edit3 className="w-3.5 h-3.5 text-indigo-600" />
                <span>{activeTab === 'edit' ? 'View Profile' : 'Edit Info'}</span>
              </button>

              <button
                onClick={() => {
                  onClose();
                  onLogout();
                }}
                className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold rounded-xl text-xs flex items-center space-x-1.5 transition-all cursor-pointer"
                title="Log Out of ApexWMS"
              >
                <LogOut className="w-3.5 h-3.5 text-rose-600" />
                <span>Log Out</span>
              </button>
            </div>
          </div>
        </div>

        {/* Modal Navigation Tabs */}
        <div className="flex items-center space-x-1 px-6 pt-3 border-b border-slate-200 bg-white text-xs font-semibold overflow-x-auto">
          <button
            onClick={() => setActiveTab('info')}
            className={`pb-3 px-3 border-b-2 font-bold cursor-pointer transition-colors whitespace-nowrap flex items-center space-x-1.5 ${
              activeTab === 'info'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <User className="w-3.5 h-3.5" />
            <span>Profile Info</span>
          </button>

          <button
            onClick={() => setActiveTab('edit')}
            className={`pb-3 px-3 border-b-2 font-bold cursor-pointer transition-colors whitespace-nowrap flex items-center space-x-1.5 ${
              activeTab === 'edit'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Edit3 className="w-3.5 h-3.5" />
            <span>Edit Profile</span>
          </button>

          <button
            onClick={() => setActiveTab('permissions')}
            className={`pb-3 px-3 border-b-2 font-bold cursor-pointer transition-colors whitespace-nowrap flex items-center space-x-1.5 ${
              activeTab === 'permissions'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Role & Permissions</span>
          </button>

          <button
            onClick={() => setActiveTab('activity')}
            className={`pb-3 px-3 border-b-2 font-bold cursor-pointer transition-colors whitespace-nowrap flex items-center space-x-1.5 ${
              activeTab === 'activity'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>Session Logs ({userActivities.length})</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 text-xs max-h-[60vh] overflow-y-auto">
          
          {/* TAB 1: OVERVIEW INFO */}
          {activeTab === 'info' && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center">
                    <User className="w-3.5 h-3.5 mr-1 text-slate-400" /> Full Name
                  </span>
                  <p className="font-bold text-sm text-slate-900">{currentUser.name}</p>
                </div>

                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center">
                    <Mail className="w-3.5 h-3.5 mr-1 text-slate-400" /> Work Email Address
                  </span>
                  <p className="font-mono font-semibold text-xs text-slate-900">{currentUser.email}</p>
                </div>

                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center">
                    <Building2 className="w-3.5 h-3.5 mr-1 text-slate-400" /> Department / Team
                  </span>
                  <p className="font-bold text-xs text-slate-900">{currentUser.department || 'Warehouse Operations'}</p>
                </div>

                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center">
                    <Clock className="w-3.5 h-3.5 mr-1 text-slate-400" /> Work Shift
                  </span>
                  <p className="font-medium text-xs text-slate-900">{currentUser.shift || 'First Shift (07:00 - 15:30)'}</p>
                </div>

                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center">
                    <IdCard className="w-3.5 h-3.5 mr-1 text-slate-400" /> Employee Badge Code
                  </span>
                  <p className="font-mono font-bold text-xs text-slate-900">{currentUser.badgeCode || 'BDG-0000'}</p>
                </div>

                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center">
                    <ShieldCheck className="w-3.5 h-3.5 mr-1 text-slate-400" /> User Account ID
                  </span>
                  <p className="font-mono text-xs font-semibold text-slate-700">{currentUser.id}</p>
                </div>

              </div>

              {/* Role Scope Description Card */}
              <div className="p-4 rounded-xl border border-indigo-100 bg-indigo-50/60 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-indigo-950 flex items-center text-xs">
                    <Award className="w-4 h-4 mr-1.5 text-indigo-600" />
                    Assigned Security Role: {roleDef.title}
                  </span>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${roleBadgeStyle}`}>
                    {currentUser.role}
                  </span>
                </div>
                <p className="text-xs text-indigo-900 leading-relaxed">
                  {roleDef.description}
                </p>
              </div>
            </div>
          )}

          {/* TAB 2: EDIT PROFILE FORM */}
          {activeTab === 'edit' && (
            <form onSubmit={handleSaveProfile} className="space-y-4">
              
              {saveSuccess && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs font-bold flex items-center space-x-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Profile updated successfully!</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Full Name *</label>
                  <input
                    type="text"
                    required
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Email Address *</label>
                  <input
                    type="email"
                    required
                    value={editEmail}
                    onChange={(e) => setEditEmail(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg font-mono text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Department</label>
                  <input
                    type="text"
                    value={editDept}
                    onChange={(e) => setEditDept(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    placeholder="e.g. Inbound Dock & Receiving"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Shift / Schedule</label>
                  <input
                    type="text"
                    value={editShift}
                    onChange={(e) => setEditShift(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    placeholder="e.g. First Shift (07:00 - 15:30)"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Employee Badge Code</label>
                  <input
                    type="text"
                    value={editBadge}
                    onChange={(e) => setEditBadge(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg font-mono text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    placeholder="e.g. BDG-9081"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Role (RBAC Controlled)</label>
                  <input
                    type="text"
                    disabled
                    value={currentUser.role}
                    className="w-full px-3 py-2 bg-slate-200 border border-slate-300 rounded-lg font-bold text-slate-600 cursor-not-allowed"
                  />
                  <span className="text-[10px] text-slate-500 mt-0.5 block">Role changes must be done via Role Management settings.</span>
                </div>
              </div>

              <div className="flex items-center justify-end space-x-3 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setActiveTab('info')}
                  className="px-4 py-2 border border-slate-300 rounded-xl text-slate-700 font-bold hover:bg-slate-100 transition-all cursor-pointer"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-xs transition-all cursor-pointer disabled:opacity-50 flex items-center space-x-1.5"
                >
                  <Save className="w-4 h-4" />
                  <span>{isSaving ? 'Saving Changes...' : 'Save Profile Changes'}</span>
                </button>
              </div>

            </form>
          )}

          {/* Change my password (shown under the profile form) */}
          {activeTab === 'edit' && (
            <form onSubmit={submitPasswordChange} className="mt-6 pt-5 border-t border-slate-200 space-y-3">
              <h4 className="font-extrabold text-slate-800 flex items-center">
                <Key className="w-4 h-4 mr-1.5 text-indigo-600" /> Change My Password
              </h4>
              {pwMessage && (
                <div className={`p-3 rounded-xl text-xs font-bold border ${pwMessage.ok ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'}`}>
                  {pwMessage.text}
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <input type="password" autoComplete="current-password" placeholder="Current password" value={curPw} onChange={(e) => setCurPw(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-slate-900 focus:bg-white focus:outline-none focus:border-indigo-600" />
                <input type="password" autoComplete="new-password" placeholder="New password (min. 8)" value={newPw} onChange={(e) => setNewPw(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-slate-900 focus:bg-white focus:outline-none focus:border-indigo-600" />
                <input type="password" autoComplete="new-password" placeholder="Repeat new password" value={newPw2} onChange={(e) => setNewPw2(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-slate-900 focus:bg-white focus:outline-none focus:border-indigo-600" />
              </div>
              <div className="flex justify-end">
                <button type="submit" disabled={pwBusy || !curPw || !newPw}
                  className="px-5 py-2 bg-slate-800 hover:bg-slate-900 text-white font-bold rounded-xl transition-all cursor-pointer disabled:opacity-50">
                  {pwBusy ? 'Changing...' : 'Change Password'}
                </button>
              </div>
            </form>
          )}

          {/* TAB 3: ROLE & PERMISSIONS */}
          {activeTab === 'permissions' && (
            <div className="space-y-4">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                <h4 className="font-bold text-slate-800 text-xs mb-1">Granted WMS Permissions for [{currentUser.role}]</h4>
                <p className="text-[11px] text-slate-500">
                  Permissions control access across inventory, order fulfillment, receiving, quarantine, and system settings.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {[
                  { key: 'inventory:read', label: 'View Inventory SKUs & Bins' },
                  { key: 'inventory:write', label: 'Create & Edit SKUs / Stock' },
                  { key: 'inbound:receive', label: 'Inbound Goods Receipt' },
                  { key: 'traceability:view', label: 'Batch Lineage & Expiry' },
                  { key: 'quarantine:manage', label: 'Quarantine & Batch Recalls' },
                  { key: 'orders:view', label: 'View Outbound Orders' },
                  { key: 'orders:pick', label: 'Execute Pick Walk Routes' },
                  { key: 'orders:manage', label: 'Manage Orders & Allocations' },
                  { key: 'mssql:console', label: 'MS SQL Server Console' },
                  { key: 'settings:manage', label: 'System RBAC Settings' }
                ].map((perm) => {
                  const isGranted = hasPermission(currentUser.role, perm.key as any, customRolePermissions);
                  return (
                    <div
                      key={perm.key}
                      className={`p-2.5 rounded-xl border flex items-center justify-between text-xs font-semibold ${
                        isGranted
                          ? 'bg-emerald-50/70 border-emerald-200 text-emerald-950'
                          : 'bg-slate-50 border-slate-200 text-slate-400 opacity-60'
                      }`}
                    >
                      <div className="flex items-center space-x-2">
                        {isGranted ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                        ) : (
                          <X className="w-4 h-4 text-slate-400 shrink-0" />
                        )}
                        <span>{perm.label}</span>
                      </div>
                      <span className={`text-[10px] font-mono uppercase px-1.5 py-0.5 rounded ${
                        isGranted ? 'bg-emerald-100 text-emerald-800 font-bold' : 'bg-slate-200 text-slate-500'
                      }`}>
                        {isGranted ? 'ALLOWED' : 'DENIED'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 4: SESSION & AUDIT HISTORY */}
          {activeTab === 'activity' && (
            <div className="space-y-3">
              <p className="text-xs text-slate-500 font-medium">
                Recent actions logged in the WMS Audit Trail for <strong className="text-slate-800">{currentUser.name}</strong>:
              </p>

              {userActivities.length === 0 ? (
                <div className="p-8 text-center bg-slate-50 rounded-xl border border-slate-200 text-slate-400">
                  <Activity className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="font-bold">No recent audit activity found for this user.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {userActivities.map((act) => (
                    <div
                      key={act.id}
                      className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-start justify-between text-xs gap-3"
                    >
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="font-mono font-bold text-slate-900">{act.actionType}</span>
                          <span className="px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-800 font-mono text-[10px] font-extrabold">
                            {act.actionCategory}
                          </span>
                        </div>
                        <p className="text-slate-600 text-[11px] mt-1 font-medium leading-relaxed">{act.details}</p>
                      </div>

                      <span className="text-[10px] font-mono text-slate-400 shrink-0 whitespace-nowrap">
                        {act.timestamp}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3 flex-wrap">
          <button
            onClick={() => {
              onClose();
              onOpenSwitchUserModal();
            }}
            className="px-3.5 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 font-bold rounded-xl text-xs flex items-center space-x-1.5 transition-all cursor-pointer"
          >
            <Key className="w-4 h-4 text-indigo-600" />
            <span>Switch User Account</span>
          </button>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => {
                onClose();
                onLogout();
              }}
              className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-xs flex items-center space-x-1.5 transition-all shadow-xs cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              <span>Log Out</span>
            </button>

            <button
              onClick={onClose}
              className="px-4 py-2 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 font-bold rounded-xl text-xs transition-all cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
