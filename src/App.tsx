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
import { fetchInventory, fetchOrders, fetchAuditLogs, createAuditLogEntry, fetchUsers, createUser, updateUserProfile, deleteUser } from './services/api';
import {
  INITIAL_SKUS,
  INITIAL_LOCATIONS,
  INITIAL_BATCHES,
  INITIAL_ORDERS,
  INITIAL_STOCK_MOVEMENTS,
  INITIAL_AUDIT_LOGS,
  INITIAL_FACILITIES,
  INITIAL_ZONES
} from './data/initialData';
import { ProductSKU, Location, Batch, PickOrder, StockMovement, AuditLogEntry, AuditCategory, WarehouseFacility, StorageZone } from './types/wms';
import { INITIAL_USERS, UserProfile, UserRole, WmsPermission, ROLE_DEFINITIONS } from './types/roles';

export default function App() {
  const [activeTab, setActiveTab] = useState<'inventory' | 'salesOrders' | 'reports' | 'traceability' | 'route' | 'mssql' | 'mobile'>('inventory');
  const [isMobileMode, setIsMobileMode] = useState(false);
  const [showAiModal, setShowAiModal] = useState(false);
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [showBackupModal, setShowBackupModal] = useState(false);

  // User Auth & RBAC Roles State
  const [usersList, setUsersList] = useState<UserProfile[]>(INITIAL_USERS);
  const [currentUser, setCurrentUser] = useState<UserProfile>(INITIAL_USERS[0]); // Default Admin
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(true);
  const [showUserProfileModal, setShowUserProfileModal] = useState<boolean>(false);
  const [showLoginModal, setShowLoginModal] = useState<boolean>(false);

  // Custom RBAC Role Permissions Matrix state (Admin editable)
  const [customRolePermissions, setCustomRolePermissions] = useState<Record<UserRole, WmsPermission[]>>(() => {
    const saved = localStorage.getItem('apex_custom_role_permissions');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.warn('Failed to parse saved custom role permissions', e);
      }
    }
    return {
      Admin: [...ROLE_DEFINITIONS.Admin.permissions],
      'Warehouse Manager': [...ROLE_DEFINITIONS['Warehouse Manager'].permissions],
      Picker: [...ROLE_DEFINITIONS.Picker.permissions],
      Receiver: [...ROLE_DEFINITIONS.Receiver.permissions]
    };
  });

  const handleToggleRolePermission = (role: UserRole, permission: WmsPermission) => {
    setCustomRolePermissions((prev) => {
      const currentList = prev[role] || [];
      const has = currentList.includes(permission);
      const nextList = has
        ? currentList.filter((p) => p !== permission)
        : [...currentList, permission];
      const updated = { ...prev, [role]: nextList };
      localStorage.setItem('apex_custom_role_permissions', JSON.stringify(updated));
      
      logAuditActivity(
        'ROLE_MANAGEMENT',
        has ? 'REVOKE_PERMISSION' : 'GRANT_PERMISSION',
        role,
        `Admin ${currentUser.name} ${has ? 'REVOKED' : 'GRANTED'} capability '${permission}' for role '${role}'.`,
        'WARNING'
      );
      
      return updated;
    });
  };

  const handleResetRolePermissions = () => {
    const defaultPerms: Record<UserRole, WmsPermission[]> = {
      Admin: [...ROLE_DEFINITIONS.Admin.permissions],
      'Warehouse Manager': [...ROLE_DEFINITIONS['Warehouse Manager'].permissions],
      Picker: [...ROLE_DEFINITIONS.Picker.permissions],
      Receiver: [...ROLE_DEFINITIONS.Receiver.permissions]
    };
    setCustomRolePermissions(defaultPerms);
    localStorage.setItem('apex_custom_role_permissions', JSON.stringify(defaultPerms));
    logAuditActivity(
      'ROLE_MANAGEMENT',
      'RESET_PERMISSIONS_MATRIX',
      'ROLE_DEFINITIONS',
      `Admin ${currentUser.name} RESET Role Permission Security Matrix to factory default definitions.`,
      'CRITICAL'
    );
  };

  // WMS State
  const [skus, setSkus] = useState<ProductSKU[]>(INITIAL_SKUS);
  const [locations, setLocations] = useState<Location[]>(INITIAL_LOCATIONS);
  const [batches, setBatches] = useState<any[]>(INITIAL_BATCHES);
  const [orders, setOrders] = useState<PickOrder[]>(INITIAL_ORDERS);
  const [stockMovements, setStockMovements] = useState<StockMovement[]>(INITIAL_STOCK_MOVEMENTS);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>(INITIAL_AUDIT_LOGS);
  const [facilities, setFacilities] = useState<WarehouseFacility[]>(INITIAL_FACILITIES);
  const [zones, setZones] = useState<StorageZone[]>(INITIAL_ZONES);
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
      if (invData) {
        setSkus(invData.skus || INITIAL_SKUS);
        setLocations(invData.locations || INITIAL_LOCATIONS);
        setBatches(invData.batches || INITIAL_BATCHES);
        setStockMovements(invData.stockMovements || INITIAL_STOCK_MOVEMENTS);
        if (invData.facilities) setFacilities(invData.facilities);
        if (invData.zones) setZones(invData.zones);
        if (invData.deletedCategories) {
          setDeletedCategories(invData.deletedCategories);
        }
      }

      const orderData = await fetchOrders();
      if (orderData) {
        setOrders(orderData);
      }

      const logsData = await fetchAuditLogs();
      if (logsData && logsData.length > 0) {
        setAuditLogs(logsData);
      }

      const userData = await fetchUsers();
      if (userData && userData.length > 0) {
        setUsersList(userData);
        setCurrentUser((prev) => {
          const matched = userData.find((u) => u.id === prev.id);
          return matched || userData[0];
        });
      }
    } catch (err) {
      console.warn('Backend loading warning, using local initial state:', err);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const logAuditActivity = (
    actionCategory: AuditCategory,
    actionType: string,
    targetEntity: string,
    details: string,
    severity: 'INFO' | 'WARNING' | 'CRITICAL' = 'INFO'
  ) => {
    const newEntry: AuditLogEntry = {
      id: `AUD-${Date.now().toString().slice(-6)}`,
      timestamp: new Date().toISOString().replace('T', ' ').slice(0, 19),
      userId: currentUser.id,
      userName: currentUser.name,
      userRole: currentUser.role,
      actionCategory,
      actionType,
      targetEntity,
      details,
      severity,
      ipAddress: '192.168.1.10'
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

  const handleSwitchUser = (newUser: UserProfile) => {
    logAuditActivity(
      'ROLE_MANAGEMENT',
      'USER_PROFILE_SWITCH',
      `User ${newUser.name}`,
      `Switched active session user profile to ${newUser.name} (${newUser.role}).`,
      'INFO'
    );
    setCurrentUser(newUser);
    setIsLoggedIn(true);
  };

  const handleLogin = (user: UserProfile) => {
    setCurrentUser(user);
    setIsLoggedIn(true);
    logAuditActivity(
      'SYSTEM',
      'USER_LOGIN',
      `User ${user.name}`,
      `Authenticated user login session for ${user.name} (${user.role}).`,
      'INFO'
    );
  };

  const handleLogout = () => {
    logAuditActivity(
      'SYSTEM',
      'USER_LOGOUT',
      `User ${currentUser.name}`,
      `User ${currentUser.name} signed out of active session.`,
      'INFO'
    );
    setIsLoggedIn(false);
    setShowUserProfileModal(false);
    setShowLoginModal(true);
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
    } catch (err) {
      // Local fallback
      setUsersList((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, role: newRole } : u))
      );
      if (currentUser.id === userId) {
        setCurrentUser((prev) => ({ ...prev, role: newRole }));
      }
    }
  };

  const handleCreateUser = async (userData: {
    name: string;
    email: string;
    role: UserRole;
    department?: string;
    shift?: string;
    badgeCode?: string;
  }) => {
    try {
      const created = await createUser(userData);
      setUsersList((prev) => [...prev, created]);
      logAuditActivity(
        'ROLE_MANAGEMENT',
        'USER_CREATED',
        `User ${created.name}`,
        `Created team member profile for ${created.name} (${created.role}, ${created.email}).`,
        'INFO'
      );
      return created;
    } catch (err: any) {
      // Local fallback
      const fallbackUser: UserProfile = {
        id: `USR-${Math.floor(100 + Math.random() * 900)}`,
        name: userData.name,
        email: userData.email,
        role: userData.role,
        department: userData.department || 'Warehouse Operations',
        shift: userData.shift || 'First Shift (07:00 - 15:30)',
        badgeCode: userData.badgeCode || `BDG-${Math.floor(1000 + Math.random() * 9000)}`
      };
      setUsersList((prev) => [...prev, fallbackUser]);
      return fallbackUser;
    }
  };

  const handleEditUserProfile = async (id: string, updates: Partial<UserProfile>) => {
    try {
      const updated = await updateUserProfile(id, updates);
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
    } catch (err) {
      setUsersList((prev) =>
        prev.map((u) => (u.id === id ? { ...u, ...updates } : u))
      );
      if (currentUser.id === id) {
        setCurrentUser((prev) => ({ ...prev, ...updates }));
      }
    }
  };

  const handleDeleteUser = async (id: string) => {
    const target = usersList.find((u) => u.id === id);
    try {
      await deleteUser(id);
    } catch (err) {
      console.warn('Backend delete failed, performing local delete:', err);
    }
    const remaining = usersList.filter((u) => u.id !== id);
    setUsersList(remaining);
    if (currentUser.id === id && remaining.length > 0) {
      setCurrentUser(remaining[0]);
    }
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

  return (
    <div className="min-h-screen bg-slate-50/80 text-slate-900 flex flex-col font-sans antialiased selection:bg-indigo-600 selection:text-white">
      
      {/* Top Header Navigation */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        isMobileMode={isMobileMode}
        setIsMobileMode={setIsMobileMode}
        onOpenAiInsights={() => setShowAiModal(true)}
        onOpenRoleModal={() => setShowRoleModal(true)}
        onOpenUserProfileModal={() => setShowUserProfileModal(true)}
        onOpenLoginModal={() => setShowLoginModal(true)}
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

      {/* Login Modal Overlay */}
      <LoginModal
        isOpen={showLoginModal}
        onClose={() => setShowLoginModal(false)}
        usersList={usersList}
        onLogin={handleLogin}
        currentUser={currentUser}
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
