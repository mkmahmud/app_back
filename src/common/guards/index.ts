import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'
import { Reflector } from '@nestjs/core'
import {
  IS_PUBLIC_KEY,
  ROLES_KEY,
  PERMISSIONS_KEY,
} from '../decorators/auth.decorators'
import { getPermissionsForRole } from '@/config/roles.config'
import type { Role, Permission } from '@/config/roles.config'
import type { JwtPayload } from '../decorators/current-user.decorator'

// ─── JWT Guard ────────────────────────────────────────────────────────────────
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super()
  }

  canActivate(context: ExecutionContext) {
    // Skip auth for @Public() routes
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ])
    if (isPublic) return true
    return super.canActivate(context)
  }

  handleRequest<T = JwtPayload>(err: Error, user: T): T {
    if (err || !user) {
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: err?.message ?? 'Authentication required',
      })
    }
    return user
  }
}

// ─── Roles Guard ──────────────────────────────────────────────────────────────
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ])
    if (!requiredRoles?.length) return true

    const { user } = context.switchToHttp().getRequest<{ user: JwtPayload }>()
    if (!user) throw new UnauthorizedException()

    if (!requiredRoles.includes(user.role as Role)) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: `Required roles: ${requiredRoles.join(', ')}`,
      })
    }
    return true
  }
}

// ─── Permissions Guard ────────────────────────────────────────────────────────
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions = this.reflector.getAllAndOverride<Permission[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()]
    )
    if (!requiredPermissions?.length) return true

    const { user } = context.switchToHttp().getRequest<{ user: JwtPayload }>()
    if (!user) throw new UnauthorizedException()

    const userPermissions = getPermissionsForRole(user.role as Role)
    const hasAll = requiredPermissions.every(p => userPermissions.includes(p))

    if (!hasAll) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Insufficient permissions',
      })
    }
    return true
  }
}
