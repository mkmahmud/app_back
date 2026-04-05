// src/common/guards/jwt-auth.guard.ts
//
// KEY FIX: NestJS guards use switchToHttp() by default, which returns
// an empty request object for GraphQL. We override getRequest() to pull
// the request from the GraphQL execution context instead.
//
import { ExecutionContext, Injectable } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { GqlExecutionContext } from '@nestjs/graphql'
import { AuthGuard } from '@nestjs/passport'
import { IS_PUBLIC_KEY } from '../decorators/auth.decorators'

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super()
  }

  canActivate(context: ExecutionContext) {
    // Allow routes/resolvers decorated with @Public()
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ])
    if (isPublic) return true

    return super.canActivate(context)
  }

  /**
   * For GraphQL, Passport's JWT strategy calls getRequest() to find
   * the Authorization header. Without this override it looks at an empty
   * HTTP context and finds nothing → 401 on every GraphQL request.
   */
  getRequest(context: ExecutionContext) {
    if (context.getType<string>() === 'graphql') {
      const ctx = GqlExecutionContext.create(context)
      return ctx.getContext<{ req: Request }>().req
    }
    return context.switchToHttp().getRequest()
  }
}
