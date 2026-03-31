import { SetMetadata } from '@nestjs/common'
import type { Role, Permission } from '@/config/roles.config'

export const ROLES_KEY = 'roles'
export const PERMISSIONS_KEY = 'permissions'
export const IS_PUBLIC_KEY = 'isPublic'

// Mark route as public (no JWT required)
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true)

// Require specific roles
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles)

// Require specific permissions
export const RequirePermissions = (...permissions: Permission[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions)
