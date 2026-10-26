import React, { useState, useRef, useEffect } from 'react';
import {
  Boxes,
  Database,
  QrCode,
  Route,
  History,
  Smartphone,
  Monitor,
  Sparkles,
  ShieldAlert,
  Clock,
  ShieldCheck,
  Lock,
  BarChart3,
  ShoppingBag,
  User,
  LogOut,
  LogIn,
  ChevronDown,
  Key,
  Shield,
  HardDrive,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Activity,
  Server,
  ExternalLink
} from 'lucide-react';
import { UserProfile, UserRole, WmsPermission, hasPermission } from '../types/roles';
import { pingMssqlBackend, toggleSimulateMssqlOffline, MssqlPingStatus } from '../services/api';

interface NavbarProps {
  activeTab: 'inventory' | 'salesOrders' | 'reports' | 'traceability' | 'route' | 'mssql' | 'mobile';
  setActiveTab: (tab: 'inventory' | 'salesOrders' | 'reports' | 'traceability' | 'route' | 'mssql' | 'mobile') => void;
  isMobileMode: boolean;
  setIsMobileMode: (val: boolean) => void;
  onOpenAiInsights: () => void;
  onOpenRoleModal: () => void;
  onOpenUserProfileModal: () => void;
  onOpenLoginModal: () => void;
  onOpenBackupModal: () => void;
  onLogout: () => void;
  isLoggedIn?: boolean;
  currentUser: UserProfile;
  criticalExpiryCount: number;
  quarantinedCount: number;
  enableSafetyReorder?: boolean;
  onToggleSafetyReorder?: (enabled: boolean) => void;
  enableInboundSupplier?: boolean;
  onToggleInboundSupplier?: (enabled: boolean) => void;
  customRolePermissions?: Record<UserRole, WmsPermission[]>;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  isMobileMode,
  setIsMobileMode,
  onOpenAiInsights,
  onOpenRoleModal,
  onOpenUserProfileModal,
  onOpenLoginModal,
  onOpenBackupModal,
  onLogout,
  isLoggedIn = true,
  currentUser,
  criticalExpiryCount,
  quarantinedCount,
  enableSafetyReorder = true,
  onToggleSafetyReorder,
  enableInboundSupplier = true,
  onToggleInboundSupplier,
  customRolePermissions
}) => {
  const canUseSqlConsole = hasPermission(currentUser.role, 'mssql:console', customRolePermissions);
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // MS SQL Server Real-Time Connectivity State & Periodic Ping
  const [mssqlStatus, setMssqlStatus] = useState<MssqlPingStatus>({
    connected: true,
    status: 'connecting',
    databaseName: 'ApexWMS_Production',
    serverHost: 'localhost',
    port: '1433'
  });
  const [isPinging, setIsPinging] = useState(false);
  const [showMssqlPopover, setShowMssqlPopover] = useState(false);
  const [lastPingTime, setLastPingTime] = useState<Date | null>(null);
  const [isSimulatingOffline, setIsSimulatingOffline] = useState(false);
  const mssqlPopoverRef = useRef<HTMLDivElement>(null);

  const performPing = async (manual = false) => {
    if (manual) setIsPinging(true);
    try {
      const res = await pingMssqlBackend();
      setMssqlStatus(res);
      setLastPingTime(new Date());
    } catch (err: any) {
      setMssqlStatus({
        connected: false,
        status: 'disconnected',
        error: err.message || 'Server ping failed',
        databaseName: 'ApexWMS_Production'
      });
      setLastPingTime(new Date());
    } finally {
      if (manual) {
        setTimeout(() => setIsPinging(false), 300);
      }
    }
  };

  useEffect(() => {
    performPing();
    const interval = setInterval(() => {
      performPing();
    }, 12000); // Periodic ping every 12 seconds
    return () => clearInterval(interval);
  }, []);

  // Close dropdowns on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowUserDropdown(false);
      }
      if (mssqlPopoverRef.current && !mssqlPopoverRef.current.contains(event.target as Node)) {
        setShowMssqlPopover(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleToggleOfflineTest = async () => {
    try {
      const res = await toggleSimulateMssqlOffline();
      setIsSimulatingOffline(res.simulateOffline);
      await performPing(true);
    } catch (err) {
      console.warn('Failed to toggle simulate offline mode', err);
    }
  };

  return (
    <header className="bg-white border-b border-slate-200 text-slate-900 sticky top-0 z-40 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          
          {/* Logo & Brand */}
          <div className="flex items-center space-x-3">
            <div className="bg-gradient-to-tr from-blue-600 to-indigo-600 p-2.5 rounded-xl shadow-sm flex items-center justify-center">
              <Boxes className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-extrabold text-xl tracking-tight text-slate-900">
                  Apex<span className="text-blue-600">WMS</span>
                </span>
                <span className="px-2 py-0.5 text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200 rounded-full">
                  v3.4 Enterprise
                </span>
              </div>
              <p className="text-xs text-slate-500 hidden sm:block">
                Smart Warehouse Engine & Real-Time Traceability
              </p>
            </div>
          </div>

          {/* Desktop Navigation Tabs */}
          <nav className="hidden lg:flex items-center space-x-1 bg-slate-100/70 p-1 rounded-2xl border border-slate-200/60">
            <button
              onClick={() => setActiveTab('inventory')}
              className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                activeTab === 'inventory'
                  ? 'bg-white text-blue-700 shadow-xs border border-slate-200/80 font-bold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
              }`}
            >
              <Boxes className="w-4 h-4 shrink-0 text-blue-600" />
              <span>Inventory</span>
            </button>

            <button
              onClick={() => setActiveTab('salesOrders')}
              className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                activeTab === 'salesOrders'
                  ? 'bg-white text-indigo-700 shadow-xs border border-slate-200/80 font-bold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
              }`}
            >
              <ShoppingBag className="w-4 h-4 shrink-0 text-indigo-600" />
              <span>Sales Orders</span>
            </button>

            <button
              onClick={() => setActiveTab('reports')}
              className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                activeTab === 'reports'
                  ? 'bg-white text-amber-700 shadow-xs border border-slate-200/80 font-bold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
              }`}
            >
              <BarChart3 className="w-4 h-4 shrink-0 text-amber-600" />
              <span>Reports</span>
            </button>

            <button
              onClick={() => setActiveTab('traceability')}
              className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer whitespace-nowrap relative ${
                activeTab === 'traceability'
                  ? 'bg-white text-emerald-700 shadow-xs border border-slate-200/80 font-bold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
              }`}
            >
              <History className="w-4 h-4 shrink-0 text-emerald-600" />
              <span>Traceability</span>
              {(criticalExpiryCount > 0 || quarantinedCount > 0) && (
                <span className="flex h-2 w-2 rounded-full bg-rose-500 absolute top-1 right-1 animate-pulse" />
              )}
            </button>

            <button
              onClick={() => setActiveTab('route')}
              className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                activeTab === 'route'
                  ? 'bg-white text-cyan-700 shadow-xs border border-slate-200/80 font-bold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
              }`}
            >
              <Route className="w-4 h-4 shrink-0 text-cyan-600" />
              <span>Routes</span>
            </button>

            <button
              onClick={() => setActiveTab('mssql')}
              className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                activeTab === 'mssql'
                  ? 'bg-white text-indigo-700 shadow-xs border border-slate-200/80 font-bold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
              }`}
            >
              <Database className="w-4 h-4 shrink-0 text-indigo-600" />
              <span className="flex items-center space-x-1.5">
                <span>MS SQL</span>
                <span className="relative flex h-2 w-2" title={`MS SQL: ${mssqlStatus.connected ? 'Connected' : 'Disconnected'}`}>
                  <span
                    className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                      mssqlStatus.connected ? 'bg-emerald-400' : 'bg-rose-400'
                    }`}
                  />
                  <span
                    className={`relative inline-flex rounded-full h-2 w-2 ${
                      mssqlStatus.connected ? 'bg-emerald-500' : 'bg-rose-500'
                    }`}
                  />
                </span>
                {!canUseSqlConsole && (
                  <Lock className="w-3 h-3 text-amber-500 ml-0.5 inline" />
                )}
              </span>
            </button>
          </nav>

          {/* Right Action Controls */}
          <div className="flex items-center space-x-2">

            {isLoggedIn ? (
              /* User Profile & Account Dropdown */
              <div className="relative" ref={dropdownRef}>
                <button
                  onClick={() => setShowUserDropdown(!showUserDropdown)}
                  className="flex items-center space-x-2 px-2.5 py-1.5 rounded-xl text-xs font-semibold bg-slate-50 hover:bg-slate-100 text-slate-800 border border-slate-200 shadow-2xs transition-all cursor-pointer"
                  title="View user profile & account options"
                >
                  <div className="w-6 h-6 rounded-lg bg-indigo-600 text-white font-extrabold text-[10px] flex items-center justify-center shrink-0">
                    {currentUser.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()}
                  </div>
                  <span className="font-bold text-slate-800 hidden md:inline">{currentUser.name}</span>
                  <span className={`px-1.5 py-0.2 rounded text-[10px] font-mono font-extrabold ${
                    currentUser.role === 'Admin'
                      ? 'bg-rose-100 text-rose-800 border border-rose-200'
                      : currentUser.role === 'Warehouse Manager'
                      ? 'bg-blue-100 text-blue-800 border border-blue-200'
                      : currentUser.role === 'Picker'
                      ? 'bg-amber-100 text-amber-800 border border-amber-200'
                      : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                  }`}>
                    {currentUser.role}
                  </span>
                  <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-150 ${showUserDropdown ? 'rotate-180' : ''}`} />
                </button>

                {/* Dropdown Menu Popup */}
                {showUserDropdown && (
                  <div className="absolute right-0 mt-2 w-64 bg-white rounded-2xl shadow-xl border border-slate-200 py-2 z-50 animate-in fade-in zoom-in-95 duration-100">
                    
                    <div className="px-4 py-2.5 border-b border-slate-100 bg-slate-50/80">
                      <p className="text-xs font-extrabold text-slate-900 truncate">{currentUser.name}</p>
                      <p className="text-[11px] text-slate-500 font-mono truncate">{currentUser.email}</p>
                      <div className="flex items-center space-x-2 mt-1">
                        <span className="text-[10px] font-mono font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.2 rounded border border-indigo-200">
                          {currentUser.badgeCode || 'NO-BADGE'}
                        </span>
                        <span className="text-[10px] font-medium text-slate-500">
                          {currentUser.shift?.split(' ')[0] || 'Shift 1'}
                        </span>
                      </div>
                    </div>

                    <div className="py-1 text-xs">
                      <button
                        onClick={() => {
                          setShowUserDropdown(false);
                          onOpenUserProfileModal();
                        }}
                        className="w-full text-left px-4 py-2 hover:bg-indigo-50 text-slate-700 hover:text-indigo-900 font-bold flex items-center space-x-2 transition-colors cursor-pointer"
                      >
                        <User className="w-4 h-4 text-indigo-600" />
                        <span>User Profile Information</span>
                      </button>

                      <button
                        onClick={() => {
                          setShowUserDropdown(false);
                          onOpenRoleModal();
                        }}
                        className="w-full text-left px-4 py-2 hover:bg-slate-100 text-slate-700 font-medium flex items-center space-x-2 transition-colors cursor-pointer"
                      >
                        <ShieldCheck className="w-4 h-4 text-blue-600" />
                        <span>Switch Account / RBAC Roles</span>
                      </button>
                    </div>

                    <div className="pt-1 border-t border-slate-100 px-1">
                      <button
                        onClick={() => {
                          setShowUserDropdown(false);
                          onLogout();
                        }}
                        className="w-full text-left px-3 py-2 rounded-xl hover:bg-rose-50 text-rose-700 font-bold flex items-center space-x-2 transition-colors cursor-pointer"
                      >
                        <LogOut className="w-4 h-4 text-rose-600" />
                        <span>Log Out</span>
                      </button>
                    </div>

                  </div>
                )}
              </div>
            ) : (
              /* Logged Out - Show Login Button */
              <button
                onClick={onOpenLoginModal}
                className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-extrabold bg-blue-600 hover:bg-blue-700 text-white shadow-xs transition-all cursor-pointer"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>Log In</span>
              </button>
            )}

            {/* Direct 1-Click Logout Button when logged in */}
            {isLoggedIn && (
              <button
                onClick={onLogout}
                className="hidden sm:flex items-center space-x-1 px-2.5 py-1.5 rounded-xl text-xs font-bold bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 shadow-2xs transition-all cursor-pointer"
                title="Log Out of ApexWMS"
              >
                <LogOut className="w-3.5 h-3.5 text-rose-600" />
                <span>Log Out</span>
              </button>
            )}

            {/* Real-time MS SQL Database Connectivity Indicator */}
            <div className="relative" ref={mssqlPopoverRef}>
              <button
                onClick={() => setShowMssqlPopover(!showMssqlPopover)}
                className={`flex items-center space-x-2 px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer border shadow-2xs ${
                  mssqlStatus.connected
                    ? 'bg-emerald-50/90 hover:bg-emerald-100/90 text-emerald-950 border-emerald-300/80 hover:border-emerald-400'
                    : 'bg-rose-50 hover:bg-rose-100 text-rose-950 border-rose-300 hover:border-rose-400'
                }`}
                title={`MS SQL Server: ${mssqlStatus.connected ? 'Connected (Live)' : 'Disconnected (Offline)'} - Click to view status & ping diagnostics`}
              >
                {/* Real-time Color-Coded Dot (Green: connected, Red: disconnected) */}
                <span className="relative flex h-2.5 w-2.5 items-center justify-center">
                  <span
                    className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                      isPinging
                        ? 'bg-amber-400'
                        : mssqlStatus.connected
                        ? 'bg-emerald-400'
                        : 'bg-rose-500'
                    }`}
                  />
                  <span
                    className={`relative inline-flex rounded-full h-2 w-2 ${
                      isPinging
                        ? 'bg-amber-500'
                        : mssqlStatus.connected
                        ? 'bg-emerald-500'
                        : 'bg-rose-600'
                    }`}
                  />
                </span>

                <div className="flex items-center space-x-1.5">
                  <span className="font-extrabold tracking-tight text-[11px] sm:text-xs">
                    MS SQL
                  </span>
                  <span
                    className={`text-[10px] font-bold px-1.5 py-0.2 rounded-md font-mono hidden sm:inline-block ${
                      mssqlStatus.connected
                        ? 'bg-emerald-200/60 text-emerald-800'
                        : 'bg-rose-200 text-rose-800'
                    }`}
                  >
                    {isPinging
                      ? 'Pinging...'
                      : mssqlStatus.connected
                      ? `${mssqlStatus.latencyMs ?? 8}ms`
                      : 'Offline'}
                  </span>
                </div>
              </button>

              {/* Status Popover Dropdown Card */}
              {showMssqlPopover && (
                <div className="absolute right-0 mt-2 w-80 sm:w-88 bg-white rounded-2xl shadow-2xl border border-slate-200 p-4 z-50 animate-in fade-in zoom-in-95 duration-100">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                    <div className="flex items-center space-x-2.5">
                      <div className={`p-2 rounded-xl ${mssqlStatus.connected ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                        <Database className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="text-xs font-extrabold text-slate-900">MS SQL Server Status</h4>
                        <p className="text-[10px] text-slate-500 font-mono">Backend Database Connection</p>
                      </div>
                    </div>
                    <span
                      className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wide border ${
                        mssqlStatus.connected
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                          : 'bg-rose-50 text-rose-800 border-rose-300'
                      }`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${mssqlStatus.connected ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                      <span>{mssqlStatus.connected ? 'Connected' : 'Disconnected'}</span>
                    </span>
                  </div>

                  {/* Diagnostic Details Grid */}
                  <div className="py-3 space-y-2 text-xs">
                    <div className="flex justify-between items-center py-1 border-b border-slate-50 text-slate-600">
                      <span className="text-[11px] font-medium text-slate-500">Database Engine</span>
                      <span className="font-bold text-slate-800 text-[11px] text-right truncate max-w-[160px]">
                        {mssqlStatus.serverVersion?.split('-')[0] || 'MS SQL Server 2025'}
                      </span>
                    </div>

                    <div className="flex justify-between items-center py-1 border-b border-slate-50 text-slate-600">
                      <span className="text-[11px] font-medium text-slate-500">Target Database</span>
                      <span className="font-mono font-bold text-slate-800 text-[11px]">
                        {mssqlStatus.databaseName || 'ApexWMS_Production'}
                      </span>
                    </div>

                    <div className="flex justify-between items-center py-1 border-b border-slate-50 text-slate-600">
                      <span className="text-[11px] font-medium text-slate-500">Host / Instance</span>
                      <span className="font-mono text-slate-700 text-[11px]">
                        {mssqlStatus.serverHost || 'localhost'}:{mssqlStatus.port || '1433'}
                      </span>
                    </div>

                    <div className="flex justify-between items-center py-1 border-b border-slate-50 text-slate-600">
                      <span className="text-[11px] font-medium text-slate-500">Response Latency</span>
                      <span className="font-mono font-bold text-[11px] flex items-center space-x-1">
                        {mssqlStatus.connected ? (
                          <span className="text-emerald-700">{mssqlStatus.latencyMs ?? 8} ms (Fast)</span>
                        ) : (
                          <span className="text-rose-600 font-bold">Unreachable</span>
                        )}
                      </span>
                    </div>

                    <div className="flex justify-between items-center py-1 border-b border-slate-50 text-slate-600">
                      <span className="text-[11px] font-medium text-slate-500">Last Verified Ping</span>
                      <span className="font-mono text-[10px] text-slate-500">
                        {lastPingTime ? lastPingTime.toLocaleTimeString() : 'Checking...'} (Auto 12s)
                      </span>
                    </div>

                    {!mssqlStatus.connected && (
                      <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 mt-2">
                        <div className="flex items-center space-x-1.5 font-bold text-[11px]">
                          <AlertCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                          <span>Connection Error</span>
                        </div>
                        <p className="text-[10px] text-rose-700 mt-1 leading-relaxed">
                          {mssqlStatus.error || 'The MS SQL database backend failed to respond to ping probes. Check if SQL Server service is active on port 1433.'}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Actions Bar */}
                  <div className="pt-2 border-t border-slate-100 flex flex-col space-y-2">
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => performPing(true)}
                        disabled={isPinging}
                        className="flex-1 py-1.5 px-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs flex items-center justify-center space-x-1.5 transition-all cursor-pointer disabled:opacity-50"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 text-slate-600 ${isPinging ? 'animate-spin' : ''}`} />
                        <span>{isPinging ? 'Pinging...' : 'Ping Now'}</span>
                      </button>

                      <button
                        onClick={() => {
                          setShowMssqlPopover(false);
                          setActiveTab('mssql');
                        }}
                        className="py-1.5 px-3 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs flex items-center space-x-1 transition-all cursor-pointer border border-indigo-200/80"
                      >
                        <span>Console</span>
                        <ExternalLink className="w-3 h-3 text-indigo-600" />
                      </button>
                    </div>

                    {/* Simulation Toggle Button */}
                    <button
                      onClick={handleToggleOfflineTest}
                      className={`w-full py-1.5 px-2 rounded-xl text-[11px] font-bold border transition-all cursor-pointer flex items-center justify-center space-x-1.5 ${
                        isSimulatingOffline
                          ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-300'
                          : 'bg-slate-50 hover:bg-rose-50 text-slate-600 hover:text-rose-700 border-slate-200 hover:border-rose-200'
                      }`}
                      title="Test how the indicator turns Green (online) or Red (offline) in real-time"
                    >
                      <Activity className="w-3 h-3" />
                      <span>
                        {isSimulatingOffline
                          ? 'Restore Normal Connection (Turn Green)'
                          : 'Simulate Connection Outage (Test Red Dot)'}
                      </span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Data Backup Button */}
            <button
              onClick={onOpenBackupModal}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200/80 shadow-2xs transition-all cursor-pointer"
              title="Open System Data Backup & Cloud Snapshot Studio"
            >
              <HardDrive className="w-3.5 h-3.5 text-blue-600" />
              <span className="hidden lg:inline">Data Backup</span>
            </button>

            {/* AI Advisor Button */}
            <button
              onClick={onOpenAiInsights}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-gradient-to-r from-purple-600 to-indigo-600 text-white hover:from-purple-500 hover:to-indigo-500 shadow-xs transition-all cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-300 animate-pulse" />
              <span className="hidden xl:inline">AI WMS Intelligence</span>
            </button>

            {/* Mode Switcher: Desktop vs Mobile Floor Handheld */}
            <button
              onClick={() => {
                const nextMode = !isMobileMode;
                setIsMobileMode(nextMode);
                if (nextMode) setActiveTab('mobile');
                else setActiveTab('inventory');
              }}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                isMobileMode
                  ? 'bg-amber-100 text-amber-900 border-amber-300 font-bold'
                  : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
              }`}
            >
              {isMobileMode ? (
                <>
                  <Smartphone className="w-3.5 h-3.5 text-amber-600" />
                  <span>Floor Mobile App</span>
                </>
              ) : (
                <>
                  <Monitor className="w-3.5 h-3.5 text-slate-600" />
                  <span className="hidden sm:inline">Handheld Mode</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Bottom/Secondary Navigation for small screens */}
      <div className="lg:hidden bg-white border-t border-slate-200 px-2 py-1.5 flex items-center justify-around text-xs overflow-x-auto">
        <button
          onClick={() => setActiveTab('inventory')}
          className={`flex flex-col items-center py-1 px-2 rounded whitespace-nowrap ${
            activeTab === 'inventory' ? 'text-blue-600 font-bold' : 'text-slate-600'
          }`}
        >
          <Boxes className="w-4 h-4 mb-0.5" />
          <span>Inventory</span>
        </button>

        <button
          onClick={() => setActiveTab('salesOrders')}
          className={`flex flex-col items-center py-1 px-2 rounded whitespace-nowrap ${
            activeTab === 'salesOrders' ? 'text-indigo-600 font-bold' : 'text-slate-600'
          }`}
        >
          <ShoppingBag className="w-4 h-4 mb-0.5 text-indigo-500" />
          <span>Sales Orders</span>
        </button>

        <button
          onClick={() => setActiveTab('reports')}
          className={`flex flex-col items-center py-1 px-2 rounded whitespace-nowrap ${
            activeTab === 'reports' ? 'text-blue-600 font-bold' : 'text-slate-600'
          }`}
        >
          <BarChart3 className="w-4 h-4 mb-0.5" />
          <span>Reports</span>
        </button>

        <button
          onClick={() => setActiveTab('traceability')}
          className={`flex flex-col items-center py-1 px-2 rounded ${
            activeTab === 'traceability' ? 'text-blue-600 font-bold' : 'text-slate-600'
          }`}
        >
          <History className="w-4 h-4 mb-0.5" />
          <span>Traceability</span>
        </button>

        <button
          onClick={() => setActiveTab('route')}
          className={`flex flex-col items-center py-1 px-2 rounded ${
            activeTab === 'route' ? 'text-blue-600 font-bold' : 'text-slate-600'
          }`}
        >
          <Route className="w-4 h-4 mb-0.5" />
          <span>Routes</span>
        </button>

        <button
          onClick={() => setActiveTab('mssql')}
          className={`flex flex-col items-center py-1 px-2 rounded relative ${
            activeTab === 'mssql' ? 'text-emerald-600 font-bold' : 'text-slate-600'
          }`}
        >
          <div className="relative">
            <Database className="w-4 h-4 mb-0.5" />
            <span
              className={`absolute -top-1 -right-1 w-2 h-2 rounded-full ${
                mssqlStatus.connected ? 'bg-emerald-500' : 'bg-rose-500 ring-2 ring-rose-200 animate-pulse'
              }`}
              title={`MS SQL: ${mssqlStatus.connected ? 'Connected' : 'Disconnected'}`}
            />
          </div>
          <span>MS SQL</span>
        </button>

        <button
          onClick={() => setActiveTab('mobile')}
          className={`flex flex-col items-center py-1 px-2 rounded ${
            activeTab === 'mobile' ? 'text-amber-600 font-bold' : 'text-slate-600'
          }`}
        >
          <Smartphone className="w-4 h-4 mb-0.5" />
          <span>Scanner</span>
        </button>
      </div>
    </header>
  );
};
