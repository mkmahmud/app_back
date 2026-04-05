import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'
import { Reflector } from '@nestjs/core'
import { GqlExecutionContext, GqlContextType } from '@nestjs/graphql'
import {
  IS_PUBLIC_KEY,
  ROLES_KEY,
  PERMISSIONS_KEY,
} from '../decorators/auth.decorators'
import { getPermissionsForRole } from '@/config/roles.config'
import type { Role, Permission } from '@/config/roles.config'
import type { JwtPayload } from '../decorators/current-user.decorator'

// ─── Helper: extract request from REST or GQL context ────────────────────────
function getRequest(context: ExecutionContext) {
  if (context.getType<GqlContextType>() === 'graphql') {
    const ctx = GqlExecutionContext.create(context)
    return ctx.getContext<{ req: Express.Request }>().req
  }
  return context.switchToHttp().getRequest()
}

// ─── JWT Guard ────────────────────────────────────────────────────────────────
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super()
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ])
    if (isPublic) return true

    return super.canActivate(context)
  }

  // Override to extract request from GQL context for passport
  getRequest(context: ExecutionContext) {
    return getRequest(context)
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

    const req = getRequest(context)
    const user = req?.user as JwtPayload | undefined
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
      [context.getHandler(), context.getClass()],
    )
    if (!requiredPermissions?.length) return true

    const req = getRequest(context)
    const user = req?.user as JwtPayload | undefined
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
