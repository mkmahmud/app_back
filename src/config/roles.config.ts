// Must stay in sync with frontend src/config/constants.ts

export const ROLES = {
  SUPERADMIN: 'superadmin',
  ADMIN: 'admin',
  USER: 'user',
  VIEWER: 'viewer',
} as const

export type Role = (typeof ROLES)[keyof typeof ROLES]

export const PERMISSIONS = {
  USER_READ: 'user:read',
  USER_CREATE: 'user:create',
  USER_UPDATE: 'user:update',
  USER_DELETE: 'user:delete',
  DASHBOARD_VIEW: 'dashboard:view',
  ANALYTICS_VIEW: 'analytics:view',
  SETTINGS_VIEW: 'settings:view',
  SETTINGS_UPDATE: 'settings:update',
  BILLING_VIEW: 'billing:view',
  BILLING_UPDATE: 'billing:update',
} as const

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS]

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  superadmin: Object.values(PERMISSIONS) as Permission[],
  admin: [
    'user:read', 'user:create', 'user:update',
    'dashboard:view', 'analytics:view',
    'settings:view', 'settings:update',
    'billing:view', 'billing:update',
  ],
  user: ['dashboard:view', 'settings:view'],
  viewer: ['dashboard:view'],
}

export function getPermissionsForRole(role: Role): Permission[] {
  return ROLE_PERMISSIONS[role] ?? []
}
