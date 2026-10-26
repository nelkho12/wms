export type UserRole = 'Admin' | 'Warehouse Manager' | 'Picker' | 'Receiver';

export type AuditCategory = 'INVENTORY' | 'INBOUND' | 'PICKING' | 'QUARANTINE' | 'ROLE_MANAGEMENT' | 'SYSTEM';

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  userId: string;
  userName: string;
  userRole: UserRole;
  actionCategory: AuditCategory;
  actionType: string;
  targetEntity: string;
  details: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  ipAddress?: string;
}

export type WmsPermission =
  | 'inventory:read'
  | 'inventory:write'
  | 'inbound:receive'
  | 'traceability:view'
  | 'quarantine:manage'
  | 'orders:view'
  | 'orders:pick'
  | 'orders:manage'
  | 'mssql:console'
  | 'settings:manage';

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatarUrl?: string;
  department: string;
  shift: string;
  badgeCode: string;
}

export interface RoleDefinition {
  role: UserRole;
  title: string;
  description: string;
  color: 'rose' | 'blue' | 'amber' | 'emerald';
  permissions: WmsPermission[];
}

export const ROLE_DEFINITIONS: Record<UserRole, RoleDefinition> = {
  Admin: {
    role: 'Admin',
    title: 'System Administrator',
    description: 'Full unrestricted authority across all WMS operations, T-SQL database studio, security settings, and emergency lot holds.',
    color: 'rose',
    permissions: [
      'inventory:read',
      'inventory:write',
      'inbound:receive',
      'traceability:view',
      'quarantine:manage',
      'orders:view',
      'orders:pick',
      'orders:manage',
      'mssql:console',
      'settings:manage'
    ]
  },
  'Warehouse Manager': {
    role: 'Warehouse Manager',
    title: 'Warehouse Manager',
    description: 'Oversees inventory slotting, stock movements, order allocations, quality quarantines, and staff pick efficiency.',
    color: 'blue',
    permissions: [
      'inventory:read',
      'inventory:write',
      'inbound:receive',
      'traceability:view',
      'quarantine:manage',
      'orders:view',
      'orders:pick',
      'orders:manage'
    ]
  },
  Picker: {
    role: 'Picker',
    title: 'Order Fulfillment Picker',
    description: 'Specialized for executing TSP/FEFO pick walk routes, scanning item barcodes, and fulfilling customer dispatch orders.',
    color: 'amber',
    permissions: [
      'inventory:read',
      'traceability:view',
      'orders:view',
      'orders:pick'
    ]
  },
  Receiver: {
    role: 'Receiver',
    title: 'Inbound Receiving Clerk',
    description: 'Dedicated to supplier goods receipt, barcode scanning, BBD lot logging, and putaway to warehouse storage bins.',
    color: 'emerald',
    permissions: [
      'inventory:read',
      'inventory:write',
      'inbound:receive',
      'traceability:view'
    ]
  }
};

export const INITIAL_USERS: UserProfile[] = [
  {
    id: 'USR-101',
    name: 'Sarah Connor',
    email: 's.connor@apexwms.io',
    role: 'Admin',
    department: 'WMS Operations & Security',
    shift: 'First Shift (07:00 - 15:30)',
    badgeCode: 'BDG-9081'
  },
  {
    id: 'USR-102',
    name: 'Marcus Vance',
    email: 'm.vance@apexwms.io',
    role: 'Warehouse Manager',
    department: 'Warehouse Floor Management',
    shift: 'First Shift (07:00 - 15:30)',
    badgeCode: 'BDG-4420'
  },
  {
    id: 'USR-103',
    name: 'Dave Miller',
    email: 'd.miller@apexwms.io',
    role: 'Picker',
    department: 'Outbound Order Pick & Pack',
    shift: 'Second Shift (15:00 - 23:30)',
    badgeCode: 'BDG-1102'
  },
  {
    id: 'USR-104',
    name: 'Elena Rostova',
    email: 'e.rostova@apexwms.io',
    role: 'Receiver',
    department: 'Inbound Dock & Goods Receipt',
    shift: 'First Shift (07:00 - 15:30)',
    badgeCode: 'BDG-7731'
  }
];

export function hasPermission(role: UserRole, permission: WmsPermission, customRolePermissions?: Record<UserRole, WmsPermission[]>): boolean {
  const perms = customRolePermissions ? customRolePermissions[role] : ROLE_DEFINITIONS[role]?.permissions;
  return perms ? perms.includes(permission) : false;
}
