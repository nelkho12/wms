import React, { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar';
import { InventoryTracker } from './components/InventoryTracker';
import { SalesOrderManager } from './components/SalesOrderManager';
import { InventoryReportGenerator } from './components/InventoryReportGenerator';
import { BatchTraceability } from './components/BatchTraceability';
import { RouteOptimizerView } from './components/RouteOptimizerView';
import { MobileFloorView } from './components/MobileFloorView';
import { MssqlConsoleView } from './components/MssqlConsoleView';
import { AiAdvisorModal } from './components/AiAdvisorModal';
import { RoleManagementModal } from './components/RoleManagementModal';
import { UserProfileModal } from './components/UserProfileModal';
import { LoginModal } from './components/LoginModal';
import { DataBackupModal } from './components/DataBackupModal';
import { fetchInventory, fetchOrders, fetchAuditLogs, createAuditLogEntry, fetchUsers, createUser, updateUserProfile, deleteUser, fetchMe, saveRolePermissions, RolePermissionMap } from './services/api';
import { AUTH_EXPIRED_EVENT, getToken, setToken } from './services/http';
import { ProductSKU, Location, Batch, PickOrder, StockMovement, AuditLogEntry, AuditCategory, WarehouseFacility, StorageZone } from './types/wms';
import { UserProfile, UserRole, WmsPermission, ROLE_DEFINITIONS } from './types/roles';

export default function App() {
  const [activeTab, setActiveTab] = useState<'inventory' | 'salesOrders' | 'reports' | 'traceability' | 'route' | 'mssql' | 'mobile'>('inventory');
  const [isMobileMode, setIsMobileMode] = useState(false);
  const [showAiModal, setShowAiModal] = useState(false);
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [showBackupModal, setShowBackupModal] = useState(false);

  // Who is signed in. Nothing is shown until the server has accepted a login.
  const SIGNED_OUT_USER: UserProfile = { id: '', name: '', email: '', role: 'Picker', department: '', shift: '', badgeCode: '' };
  const [usersList, setUsersList] = useState<UserProfile[]>([]);
  const [currentUser, setCurrentUser] = useState<UserProfile>(SIGNED_OUT_USER);
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false);
  const [authChecked, setAuthChecked] = useState<boolean>(false);
  const [loginNotice, setLoginNotice] = useState<string>('');
  const [loginPrefill, setLoginPrefill] = useState<string>('');
  const [serverDown, setServerDown] = useState<boolean>(false);
  const [showUserProfileModal, setShowUserProfileModal] = useState<boolean>(false);

  // Role permission matrix: stored on the server so every computer follows the same rules.
  const defaultPermissionMap = (): Record<UserRole, WmsPermission[]> => ({
    Admin: [...ROLE_DEFINITIONS.Admin.permissions],
    'Warehouse Manager': [...ROLE_DEFINITIONS['Warehouse Manager'].permissions],
    Picker: [...ROLE_DEFINITIONS.Picker.permissions],
    Receiver: [...ROLE_DEFINITIONS.Receiver.permissions]
  });
  const [customRolePermissions, setCustomRolePermissions] = useState<Record<UserRole, WmsPermission[]>>(defaultPermissionMap);

  const pushRolePermissions = async (next: RolePermissionMap) => {
    setCustomRolePermissions(next);
    try {
      setCustomRolePermissions(await saveRolePermissions(next));
    } catch (err: any) {
      alert(`Could not save role permissions: ${err.message}`);
      const me = await fetchMe();
      if (me) setCustomRolePermissions({ ...defaultPermissionMap(), ...me.rolePermissions });
    }
  };

  const handleToggleRolePermission = (role: UserRole, permission: WmsPermission) => {
    const currentList = customRolePermissions[role] || [];
    const has = currentList.includes(permission);
    const nextList = has ? currentList.filter((p) => p !== permission) : [...currentList, permission];
    pushRolePermissions({ ...customRolePermissions, [role]: nextList });
    logAuditActivity(
      'ROLE_MANAGEMENT',
      has ? 'REVOKE_PERMISSION' : 'GRANT_PERMISSION',
      role,
      `Admin ${currentUser.name} ${has ? 'REVOKED' : 'GRANTED'} capability '${permission}' for role '${role}'.`,
      'WARNING'
    );
  };

  const handleResetRolePermissions = () => {
    pushRolePermissions(defaultPermissionMap());
    logAuditActivity(
      'ROLE_MANAGEMENT',
      'RESET_PERMISSIONS_MATRIX',
      'ROLE_DEFINITIONS',
      `Admin ${currentUser.name} RESET Role Permission Security Matrix to factory default definitions.`,
      'CRITICAL'
    );
  };

  // WMS State
  const [skus, setSkus] = useState<ProductSKU[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [batches, setBatches] = useState<any[]>([]);
  const [orders, setOrders] = useState<PickOrder[]>([]);
  const [stockMovements, setStockMovements] = useState<StockMovement[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [facilities, setFacilities] = useState<WarehouseFacility[]>([]);
  const [zones, setZones] = useState<StorageZone[]>([]);
  const [deletedCategories, setDeletedCategories] = useState<string[]>([]);

  // Optional Feature Toggles (Admin Ticketed Functions)
  const [enableSafetyReorder, setEnableSafetyReorder] = useState<boolean>(() => {
    const saved = localStorage.getItem('apex_enable_safety_reorder');
    return saved !== null ? JSON.parse(saved) : true;
  });

  const [enableInboundSupplier, setEnableInboundSupplier] = useState<boolean>(() => {
    const saved = localStorage.getItem('apex_enable_inbound_supplier');
    return saved !== null ? JSON.parse(saved) : true;
  });

  const handleToggleSafetyReorder = (enabled: boolean) => {
    setEnableSafetyReorder(enabled);
    localStorage.setItem('apex_enable_safety_reorder', JSON.stringify(enabled));
    logAuditActivity(
      'SYSTEM',
      'FEATURE_TOGGLE',
      'SAFETY_REORDER_LEVELS',
      `Admin ${enabled ? 'ENABLED' : 'DISABLED'} optional Safety Reorder Levels feature by ticket toggle.`,
      'INFO'
    );
  };

  const handleToggleInboundSupplier = (enabled: boolean) => {
    setEnableInboundSupplier(enabled);
    localStorage.setItem('apex_enable_inbound_supplier', JSON.stringify(enabled));
    logAuditActivity(
      'SYSTEM',
      'FEATURE_TOGGLE',
      'INBOUND_SUPPLIER_INFO',
      `Admin ${enabled ? 'ENABLED' : 'DISABLED'} optional Incoming Stock Supplier/Vendor Info feature by ticket toggle.`,
      'INFO'
    );
  };

  const loadData = async () => {
    try {
      const invData = await fetchInventory();
      if (!invData) {
        setServerDown(true);
        return;
      }
      setServerDown(false);
      setSkus(invData.skus || []);
      setLocations(invData.locations || []);
      setBatches(invData.batches || []);
      setStockMovements(invData.stockMovements || []);
      setFacilities(invData.facilities || []);
      setZones(invData.zones || []);
      setDeletedCategories(invData.deletedCategories || []);

      const orderData = await fetchOrders();
      if (orderData) {
        setOrders(orderData);
      }

      const logsData = await fetchAuditLogs();
      if (logsData) {
        setAuditLogs(logsData);
      }

      const userData = await fetchUsers();
      if (userData && userData.length > 0) {
        setUsersList(userData);
        // Keep my own profile up to date (never switch to somebody else's).
        setCurrentUser((prev) => userData.find((u) => u.id === prev.id) || prev);
      }
    } catch (err) {
      console.warn('Could not load data from the service:', err);
      setServerDown(true);
    }
  };

  const clearLocalData = () => {
    setSkus([]);
    setLocations([]);
    setBatches([]);
    setOrders([]);
    setStockMovements([]);
    setAuditLogs([]);
    setFacilities([]);
    setZones([]);
    setUsersList([]);
  };

  // On start: if a saved login is still valid, go straight in.
  useEffect(() => {
    (async () => {
      if (getToken()) {
        const me = await fetchMe();
        if (me) {
          setCurrentUser(me.user);
          setCustomRolePermissions({ ...defaultPermissionMap(), ...me.rolePermissions });
          setIsLoggedIn(true);
        } else {
          setToken('');
        }
      }
      setAuthChecked(true);
    })();
  }, []);

  // The server said "please sign in again" (session ended, or the account was removed).
  useEffect(() => {
    const onExpired = () => {
      clearLocalData();
      setIsLoggedIn(false);
      setLoginNotice('Your session has ended. Please sign in again.');
    };
    window.addEventListener(AUTH_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, onExpired);
  }, []);

  // Load data after signing in, and refresh regularly so changes made on other computers appear.
  useEffect(() => {
    if (!isLoggedIn) return;
    loadData();
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') loadData();
    }, 20000);
    return () => clearInterval(timer);
  }, [isLoggedIn]);

  const logAuditActivity = (
    actionCategory: AuditCategory,
    actionType: string,
    targetEntity: string,
    details: string,
    severity: 'INFO' | 'WARNING' | 'CRITICAL' = 'INFO'
  ) => {
    // The server records the real signed-in user and time; this is only a quick local echo.
    const newEntry: AuditLogEntry = {
      id: `AUD-LOCAL-${Date.now()}`,
      timestamp: new Date().toLocaleString('sv-SE'),
      userId: currentUser.id,
      userName: currentUser.name,
      userRole: currentUser.role,
      actionCategory,
      actionType,
      targetEntity,
      details,
      severity
    };

    setAuditLogs((prev) => [newEntry, ...prev]);

    createAuditLogEntry({
      userId: currentUser.id,
      userName: currentUser.name,
      userRole: currentUser.role,
      actionCategory,
      actionType,
      targetEntity,
      details,
      severity
    });
  };

  // "Switch user" now means: sign out and sign in as that person (with their password).
  const handleSwitchUser = (newUser: UserProfile) => {
    if (newUser.id === currentUser.id) return;
    if (!window.confirm(`Sign out and sign in as ${newUser.name}? You will need their password.`)) return;
    setLoginPrefill(newUser.email);
    handleLogout();
  };

  const handleLogin = (user: UserProfile, rolePermissions: RolePermissionMap) => {
    setCurrentUser(user);
    setCustomRolePermissions({ ...defaultPermissionMap(), ...rolePermissions });
    setLoginNotice('');
    setIsLoggedIn(true);
  };

  const handleLogout = () => {
    logAuditActivity(
      'SYSTEM',
      'USER_LOGOUT',
      `User ${currentUser.name}`,
      `User ${currentUser.name} signed out of active session.`,
      'INFO'
    );
    // give the log entry a moment to reach the server before the token is dropped
    setTimeout(() => {
      setToken('');
      clearLocalData();
      setCurrentUser(SIGNED_OUT_USER);
      setIsLoggedIn(false);
      setShowUserProfileModal(false);
      setShowRoleModal(false);
    }, 150);
  };

  const handleUpdateUserRole = async (userId: string, newRole: UserRole) => {
    const targetUser = usersList.find((u) => u.id === userId);
    const oldRole = targetUser ? targetUser.role : 'Unknown';

    try {
      const updated = await updateUserProfile(userId, { role: newRole });
      setUsersList((prev) => prev.map((u) => (u.id === userId ? updated : u)));
      if (currentUser.id === userId) {
        setCurrentUser(updated);
      }
      logAuditActivity(
        'ROLE_MANAGEMENT',
        'USER_ROLE_UPDATE',
        `User ${updated.name}`,
        `Updated role for ${updated.name} from ${oldRole} to ${newRole}.`,
        'WARNING'
      );
    } catch (err: any) {
      alert(`Could not change the role: ${err.message}`);
    }
  };

  const handleCreateUser = async (userData: {
    name: string;
    email: string;
    role: UserRole;
    department?: string;
    shift?: string;
    badgeCode?: string;
    password: string;
  }) => {
    const created = await createUser(userData); // errors are shown by the form
    setUsersList((prev) => [...prev, created]);
    logAuditActivity(
      'ROLE_MANAGEMENT',
      'USER_CREATED',
      `User ${created.name}`,
      `Created team member profile for ${created.name} (${created.role}, ${created.email}).`,
      'INFO'
    );
    return created;
  };

  const handleEditUserProfile = async (id: string, updates: Partial<UserProfile> & { password?: string }) => {
    const updated = await updateUserProfile(id, updates); // errors are shown by the form
    setUsersList((prev) => prev.map((u) => (u.id === id ? updated : u)));
    if (currentUser.id === id) {
      setCurrentUser(updated);
    }
    logAuditActivity(
      'ROLE_MANAGEMENT',
      'USER_PROFILE_UPDATED',
      `User ${updated.name}`,
      `Updated team member profile for ${updated.name} (${updated.role}).`,
      'INFO'
    );
    return updated;
  };

  const handleDeleteUser = async (id: string) => {
    const target = usersList.find((u) => u.id === id);
    await deleteUser(id); // errors are shown by the form
    setUsersList((prev) => prev.filter((u) => u.id !== id));
    logAuditActivity(
      'ROLE_MANAGEMENT',
      'USER_DELETED',
      `User ${target ? target.name : id}`,
      `Deleted team member profile for ${target ? target.name : id}.`,
      'WARNING'
    );
  };

  const criticalExpiryCount = batches.filter((b) => b.expiryAlert === 'CRITICAL').length;
  const quarantinedCount = batches.filter((b) => b.status === 'QUARANTINED').length;

  if (!authChecked) {
    return <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-300 text-sm">Starting ApexWMS...</div>;
  }

  if (!isLoggedIn) {
    return <LoginModal isOpen={true} onLogin={handleLogin} prefillEmail={loginPrefill} notice={loginNotice} />;
  }

  return (
    <div className="min-h-screen bg-slate-50/80 text-slate-900 flex flex-col font-sans antialiased selection:bg-indigo-600 selection:text-white">
      {serverDown && (
        <div className="bg-rose-600 text-white text-xs font-bold text-center py-2 px-4">
          Cannot reach the ApexWMS service. What you see may be out of date, and changes will not be saved until the connection is back.
        </div>
      )}
      
      {/* Top Header Navigation */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        isMobileMode={isMobileMode}
        setIsMobileMode={setIsMobileMode}
        onOpenAiInsights={() => setShowAiModal(true)}
        onOpenRoleModal={() => setShowRoleModal(true)}
        onOpenUserProfileModal={() => setShowUserProfileModal(true)}
        onOpenLoginModal={handleLogout}
        onOpenBackupModal={() => setShowBackupModal(true)}
        onLogout={handleLogout}
        isLoggedIn={isLoggedIn}
        currentUser={currentUser}
        criticalExpiryCount={criticalExpiryCount}
        quarantinedCount={quarantinedCount}
        enableSafetyReorder={enableSafetyReorder}
        onToggleSafetyReorder={handleToggleSafetyReorder}
        enableInboundSupplier={enableInboundSupplier}
        onToggleInboundSupplier={handleToggleInboundSupplier}
        customRolePermissions={customRolePermissions}
      />

      {/* Main App Body */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        
        {activeTab === 'inventory' && (
          <InventoryTracker
            skus={skus}
            batches={batches}
            locations={locations}
            facilities={facilities}
            zones={zones}
            stockMovements={stockMovements}
            orders={orders}
            currentUser={currentUser}
            deletedCategories={deletedCategories}
            onRefresh={loadData}
            onLogAuditActivity={logAuditActivity}
            onOpenRoleModal={() => setShowRoleModal(true)}
            onNavigateTab={(tab) => setActiveTab(tab)}
            enableSafetyReorder={enableSafetyReorder}
            onToggleSafetyReorder={handleToggleSafetyReorder}
            enableInboundSupplier={enableInboundSupplier}
            onToggleInboundSupplier={handleToggleInboundSupplier}
            customRolePermissions={customRolePermissions}
          />
        )}

        {activeTab === 'salesOrders' && (
          <SalesOrderManager
            orders={orders}
            skus={skus}
            batches={batches}
            currentUser={currentUser}
            onRefresh={loadData}
            onLogAuditActivity={logAuditActivity}
            onOpenRoleModal={() => setShowRoleModal(true)}
            customRolePermissions={customRolePermissions}
          />
        )}

        {activeTab === 'reports' && (
          <InventoryReportGenerator
            skus={skus}
            batches={batches}
            locations={locations}
            stockMovements={stockMovements}
            currentUser={currentUser}
            onRefresh={loadData}
            onLogAuditActivity={logAuditActivity}
            enableSafetyReorder={enableSafetyReorder}
            onToggleSafetyReorder={handleToggleSafetyReorder}
          />
        )}

        {activeTab === 'traceability' && (
          <BatchTraceability
            batches={batches}
            skus={skus}
            orders={orders}
            stockMovements={stockMovements}
            currentUser={currentUser}
            onRefresh={loadData}
            onOpenRoleModal={() => setShowRoleModal(true)}
            customRolePermissions={customRolePermissions}
          />
        )}

        {activeTab === 'route' && (
          <RouteOptimizerView
            orders={orders}
            batches={batches}
            locations={locations}
            currentUser={currentUser}
            onRefresh={loadData}
            onOpenRoleModal={() => setShowRoleModal(true)}
            customRolePermissions={customRolePermissions}
          />
        )}

        {activeTab === 'mssql' && (
          <MssqlConsoleView
            currentUser={currentUser}
            auditLogs={auditLogs}
            onLogAuditActivity={logAuditActivity}
            onOpenRoleModal={() => setShowRoleModal(true)}
            onOpenBackupModal={() => setShowBackupModal(true)}
            customRolePermissions={customRolePermissions}
          />
        )}

        {activeTab === 'mobile' && (
          <MobileFloorView
            skus={skus}
            batches={batches}
            locations={locations}
            orders={orders}
            currentUser={currentUser}
            onRefresh={loadData}
            onOpenRoleModal={() => setShowRoleModal(true)}
            customRolePermissions={customRolePermissions}
          />
        )}

      </main>

      {/* AI Advisor Insights Modal */}
      <AiAdvisorModal
        isOpen={showAiModal}
        onClose={() => setShowAiModal(false)}
      />

      {/* Role-Based Access Control & User Switcher Modal */}
      <RoleManagementModal
        isOpen={showRoleModal}
        onClose={() => setShowRoleModal(false)}
        currentUser={currentUser}
        onSwitchUser={handleSwitchUser}
        usersList={usersList}
        onUpdateUserRole={handleUpdateUserRole}
        onCreateUser={handleCreateUser}
        onEditUserProfile={handleEditUserProfile}
        onDeleteUser={handleDeleteUser}
        enableSafetyReorder={enableSafetyReorder}
        onToggleSafetyReorder={handleToggleSafetyReorder}
        enableInboundSupplier={enableInboundSupplier}
        onToggleInboundSupplier={handleToggleInboundSupplier}
        customRolePermissions={customRolePermissions}
        onToggleRolePermission={handleToggleRolePermission}
        onResetRolePermissions={handleResetRolePermissions}
      />

      {/* User Profile Information Modal */}
      <UserProfileModal
        isOpen={showUserProfileModal}
        onClose={() => setShowUserProfileModal(false)}
        currentUser={currentUser}
        onEditUserProfile={handleEditUserProfile}
        onLogout={handleLogout}
        onOpenSwitchUserModal={() => setShowRoleModal(true)}
        auditLogs={auditLogs}
        customRolePermissions={customRolePermissions}
      />

      {/* System Data Backup & Cloud Snapshot Modal */}
      <DataBackupModal
        isOpen={showBackupModal}
        onClose={() => setShowBackupModal(false)}
        skus={skus}
        orders={orders}
        auditLogs={auditLogs}
        usersList={usersList}
        onRestoreData={({ skus: restoredSkus, orders: restoredOrders }) => {
          if (restoredSkus) setSkus(restoredSkus);
          if (restoredOrders) setOrders(restoredOrders);
          loadData();
        }}
        onLogAuditActivity={logAuditActivity}
      />

      {/* Footer */}
      <footer className="border-t border-slate-200/80 bg-white py-3.5 text-center text-xs text-slate-500 font-medium">
        ApexWMS Enterprise • Connected as <span className="text-slate-800 font-semibold">{currentUser.name}</span> ({currentUser.role})
      </footer>

    </div>
  );
}
