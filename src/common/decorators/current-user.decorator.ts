import { createParamDecorator, ExecutionContext } from '@nestjs/common'
import { GqlExecutionContext, GqlContextType } from '@nestjs/graphql'
import { Request } from 'express'

export interface JwtPayload {
  sub: string        // user id
  email: string
  role: string
  iat?: number
  exp?: number
}

export interface AuthenticatedRequest extends Request {
  user: JwtPayload
}

// Helper: get user from REST or GQL context
function getUserFromContext(ctx: ExecutionContext): JwtPayload {
  if (ctx.getType<GqlContextType>() === 'graphql') {
    const gqlCtx = GqlExecutionContext.create(ctx)
    return gqlCtx.getContext<{ req: AuthenticatedRequest }>().req.user
  }
  return ctx.switchToHttp().getRequest<AuthenticatedRequest>().user
}

// @CurrentUser() → full JWT payload
export const CurrentUser = createParamDecorator(
  (data: keyof JwtPayload | undefined, ctx: ExecutionContext) => {
    const user = getUserFromContext(ctx)
    return data ? user?.[data] : user
  },
)

// @CurrentUserId() → user id string shorthand
export const CurrentUserId = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): string => {
    const user = getUserFromContext(ctx)
    return user.sub
  },
)
