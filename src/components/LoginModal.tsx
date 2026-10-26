import React, { useState } from 'react';
import {
  LogIn,
  ShieldCheck,
  User,
  Key,
  Lock,
  Building2,
  Clock,
  IdCard,
  X,
  CheckCircle2,
  Boxes,
  Database,
  ArrowRight,
  ShieldAlert
} from 'lucide-react';
import { UserProfile, UserRole, ROLE_DEFINITIONS } from '../types/roles';

interface LoginModalProps {
  isOpen: boolean;
  onClose?: () => void;
  usersList: UserProfile[];
  onLogin: (user: UserProfile) => void;
  currentUser?: UserProfile;
}

export const LoginModal: React.FC<LoginModalProps> = ({
  isOpen,
  onClose,
  usersList,
  onLogin,
  currentUser
}) => {
  const [selectedUser, setSelectedUser] = useState<UserProfile>(
    currentUser || usersList[0] || {
      id: 'USR-101',
      name: 'Sarah Connor',
      email: 's.connor@apexwms.io',
      role: 'Admin',
      department: 'WMS Operations & Security',
      shift: 'First Shift (07:00 - 15:30)',
      badgeCode: 'BDG-9081'
    }
  );

  const [passwordInput, setPasswordInput] = useState('••••••••');
  const [badgeCodeInput, setBadgeCodeInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [loginError, setLoginError] = useState('');

  if (!isOpen) return null;

  const handleSelectUser = (u: UserProfile) => {
    setSelectedUser(u);
    setBadgeCodeInput(u.badgeCode || '');
    setLoginError('');
  };

  const handleSubmitLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) {
      setLoginError('Please select a user account to proceed.');
      return;
    }

    setIsLoading(true);
    setLoginError('');

    setTimeout(() => {
      setIsLoading(false);
      onLogin(selectedUser);
      if (onClose) onClose();
    }, 400);
  };

  const getRoleStyle = (role: UserRole) => {
    switch (role) {
      case 'Admin':
        return { badge: 'bg-rose-100 text-rose-800 border-rose-300', dot: 'bg-rose-500' };
      case 'Warehouse Manager':
        return { badge: 'bg-blue-100 text-blue-800 border-blue-300', dot: 'bg-blue-500' };
      case 'Picker':
        return { badge: 'bg-amber-100 text-amber-800 border-amber-300', dot: 'bg-amber-500' };
      case 'Receiver':
        return { badge: 'bg-emerald-100 text-emerald-800 border-emerald-300', dot: 'bg-emerald-500' };
      default:
        return { badge: 'bg-slate-100 text-slate-800 border-slate-300', dot: 'bg-slate-500' };
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-xl overflow-hidden my-6 animate-in fade-in zoom-in-95 duration-200">
        
        {/* Top Branding Banner */}
        <div className="p-6 bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-white relative">
          {onClose && (
            <button
              onClick={onClose}
              className="absolute top-4 right-4 text-slate-400 hover:text-white p-1.5 rounded-xl bg-white/5 hover:bg-white/10 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          )}

          <div className="flex items-center space-x-3 mb-2">
            <div className="p-2.5 bg-gradient-to-tr from-blue-600 to-indigo-600 rounded-2xl shadow-md border border-indigo-400/30">
              <Boxes className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-extrabold text-xl tracking-tight text-white">ApexWMS</span>
                <span className="bg-indigo-500/30 border border-indigo-400/40 text-indigo-200 text-[10px] font-mono font-bold px-2 py-0.5 rounded-full">
                  v3.8 Enterprise
                </span>
              </div>
              <p className="text-xs text-slate-300 font-medium">Authentication & RBAC User Portal</p>
            </div>
          </div>

          <p className="text-xs text-slate-300 mt-3 leading-relaxed">
            Select your registered team member profile or enter your authorization badge credentials to sign in to the Warehouse Management System.
          </p>
        </div>

        {/* Modal Form Content */}
        <form onSubmit={handleSubmitLogin} className="p-6 space-y-5">
          
          {loginError && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs font-bold flex items-center space-x-2">
              <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{loginError}</span>
            </div>
          )}

          {/* Account Selection */}
          <div>
            <label className="block text-xs font-extrabold text-slate-800 uppercase tracking-wider mb-2 flex items-center justify-between">
              <span className="flex items-center">
                <User className="w-3.5 h-3.5 mr-1.5 text-indigo-600" />
                Select Authorized Account
              </span>
              <span className="text-[10px] font-normal text-slate-500">
                {usersList.length} Accounts Registered
              </span>
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-48 overflow-y-auto pr-1">
              {usersList.map((user) => {
                const isSelected = selectedUser?.id === user.id;
                const style = getRoleStyle(user.role);

                return (
                  <button
                    key={user.id}
                    type="button"
                    onClick={() => handleSelectUser(user)}
                    className={`p-3 rounded-2xl border text-left transition-all cursor-pointer flex items-start space-x-3 relative ${
                      isSelected
                        ? 'bg-indigo-50/80 border-indigo-500 ring-2 ring-indigo-500/20 shadow-xs'
                        : 'bg-slate-50 border-slate-200 hover:bg-slate-100/80 hover:border-slate-300'
                    }`}
                  >
                    <div className="w-9 h-9 rounded-xl bg-slate-900 text-white font-extrabold text-xs flex items-center justify-center shrink-0 shadow-xs">
                      {user.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1">
                        <span className="font-bold text-xs text-slate-900 truncate">{user.name}</span>
                        {isSelected && (
                          <CheckCircle2 className="w-4 h-4 text-indigo-600 shrink-0" />
                        )}
                      </div>
                      <span className={`inline-block px-1.5 py-0.2 mt-0.5 rounded text-[9px] font-mono font-extrabold border ${style.badge}`}>
                        {user.role}
                      </span>
                      <p className="text-[10px] text-slate-500 truncate mt-1 font-mono">
                        {user.badgeCode || user.email}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Active Selected User Card Preview */}
          {selectedUser && (
            <div className="p-4 bg-slate-900 text-white rounded-2xl space-y-2 border border-slate-800 shadow-md">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono uppercase tracking-wider text-indigo-300 font-bold flex items-center">
                  <ShieldCheck className="w-3.5 h-3.5 mr-1" /> Target Session Profile
                </span>
                <span className="text-[10px] font-mono text-slate-400">ID: {selectedUser.id}</span>
              </div>

              <div className="flex items-center space-x-3 pt-1">
                <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white font-extrabold text-sm flex items-center justify-center shrink-0">
                  {selectedUser.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <h4 className="font-extrabold text-sm text-white truncate">{selectedUser.name}</h4>
                  <p className="text-xs text-slate-300 font-medium">{selectedUser.department || 'Warehouse Operations'}</p>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-800 grid grid-cols-2 gap-2 text-[11px] text-slate-300">
                <div>
                  <span className="text-slate-500 text-[10px] block">Badge Code:</span>
                  <span className="font-mono font-bold text-amber-300">{selectedUser.badgeCode || 'BDG-0000'}</span>
                </div>
                <div>
                  <span className="text-slate-500 text-[10px] block">Shift:</span>
                  <span className="font-medium text-slate-200">{selectedUser.shift || 'First Shift'}</span>
                </div>
              </div>
            </div>
          )}

          {/* Security Pin / Password Box */}
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center">
                  <Lock className="w-3.5 h-3.5 mr-1 text-slate-500" /> Password / Security PIN
                </label>
                <input
                  type="password"
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:outline-none text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center">
                  <IdCard className="w-3.5 h-3.5 mr-1 text-slate-500" /> Confirm Badge Code
                </label>
                <input
                  type="text"
                  placeholder={selectedUser?.badgeCode || 'BDG-xxxx'}
                  value={badgeCodeInput || selectedUser?.badgeCode || ''}
                  onChange={(e) => setBadgeCodeInput(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:outline-none text-xs"
                />
              </div>
            </div>
          </div>

          {/* Submit Action */}
          <div className="pt-2 border-t border-slate-200 flex items-center justify-between gap-3">
            <div className="text-[11px] text-slate-500 flex items-center">
              <Database className="w-3.5 h-3.5 mr-1 text-emerald-600" />
              <span>MS SQL Server Session Ready</span>
            </div>

            <button
              type="submit"
              disabled={isLoading || !selectedUser}
              className="px-6 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-extrabold rounded-xl shadow-md transition-all cursor-pointer disabled:opacity-50 flex items-center space-x-2 text-xs"
            >
              <LogIn className="w-4 h-4" />
              <span>{isLoading ? 'Authenticating...' : `Sign In as ${selectedUser ? selectedUser.name.split(' ')[0] : 'User'}`}</span>
              <ArrowRight className="w-3.5 h-3.5 ml-1" />
            </button>
          </div>

        </form>

      </div>
    </div>
  );
};
