export const UNITS = ['Piece', 'KG', 'Gram', 'Liter', 'Packet', 'Box', 'Pair', 'Roll', 'Meter', 'Set', 'Dozen','Cotton','Nos','ML',
  'Yard',
  
 
  'Roll',
  'Sq.Ft',
  'Gallon',] as const;

export const ITEM_TYPES = [
  { value: 'new', label: 'New (Purchased)' },
  { value: 'donation', label: 'Donation' },
] as const;

export const USER_ROLES = [
  { value: 'super_admin', label: 'Super Admin' },
  { value: 'store_keeper', label: 'Store Keeper' },
  { value: 'branch_user', label: 'Branch User' },
  { value: 'viewer', label: 'Viewer' },
] as const;

export type Permission =
  | 'users.create' | 'users.edit' | 'users.delete' | 'users.manage_roles'
  | 'categories.manage'
  | 'branches.manage'
  | 'stores.manage'
  | 'settings.manage'
  | 'stock.manage'
  | 'stock.view'
  | 'purchases.manage'
  | 'donations.manage'
  | 'issues.manage'
  | 'returns.manage'
  | 'reports.view'
  | 'audit.view';

const ALL_PERMISSIONS: Permission[] = [
  'users.create', 'users.edit', 'users.delete', 'users.manage_roles',
  'categories.manage', 'branches.manage', 'stores.manage', 'settings.manage',
  'stock.manage', 'stock.view', 'purchases.manage', 'donations.manage',
  'issues.manage', 'returns.manage', 'reports.view', 'audit.view',
];

export const ROLE_PERMISSIONS: Record<string, Permission[]> = {
  super_admin: ALL_PERMISSIONS,
  store_keeper: ['stock.view', 'stock.manage', 'purchases.manage', 'donations.manage', 'issues.manage', 'returns.manage', 'reports.view'],
  branch_user: ['stock.view', 'issues.manage', 'returns.manage', 'reports.view'],
  viewer: ['stock.view', 'reports.view'],
};

// Edit/delete restricted to super_admin only
export function canEdit(role: string | undefined): boolean {
  return isSuperAdmin(role);
}

export function canDelete(role: string | undefined): boolean {
  return isSuperAdmin(role);
}

// Storekeeper can add but not edit/delete
export function canAdd(role: string | undefined, permission: Permission): boolean {
  if (!role) return false;
  if (isSuperAdmin(role)) return true;
  const perms = ROLE_PERMISSIONS[role] || [];
  return perms.includes(permission);
}

export function hasPermission(role: string | undefined, permission: Permission): boolean {
  if (!role) return false;
  const perms = ROLE_PERMISSIONS[role] || [];
  return perms.includes(permission);
}

export function isSuperAdmin(role: string | undefined): boolean {
  return role === 'super_admin';
}
