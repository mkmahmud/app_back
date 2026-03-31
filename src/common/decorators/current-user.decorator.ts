import { createParamDecorator, ExecutionContext } from '@nestjs/common'
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

// @CurrentUser() → full JWT payload
export const CurrentUser = createParamDecorator(
  (data: keyof JwtPayload | undefined, ctx: ExecutionContext) => {
    const req = ctx.switchToHttp().getRequest<AuthenticatedRequest>()
    return data ? req.user?.[data] : req.user
  }
)

// @CurrentUserId() → user id string shorthand
export const CurrentUserId = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): string => {
    const req = ctx.switchToHttp().getRequest<AuthenticatedRequest>()
    return req.user.sub
  }
)
