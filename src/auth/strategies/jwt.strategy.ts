import { Injectable, UnauthorizedException } from '@nestjs/common'
import { PassportStrategy } from '@nestjs/passport'
import { ExtractJwt, Strategy } from 'passport-jwt'
import { ConfigService } from '@nestjs/config'
import { Request } from 'express'
import { PrismaService } from '@/prisma/prisma.service'
import type { JwtPayload } from '@/common/decorators/current-user.decorator'

// ─── Access Token Strategy ────────────────────────────────────────────────────
@Injectable()
export class JwtAccessStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService,
    private prisma: PrismaService
  ) {
    super({
      // Extract from Authorization header OR auth_token cookie
      jwtFromRequest: ExtractJwt.fromExtractors([
        (req: Request) => req?.cookies?.['auth_token'] ?? null,
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      secretOrKey: config.get<string>('JWT_ACCESS_SECRET'),
      ignoreExpiration: false,
    })
  }

  async validate(payload: JwtPayload): Promise<JwtPayload> {
    // Verify user still exists and is active
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, isActive: true },
    })

    if (!user || !user.isActive) {
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'User account is inactive or does not exist',
      })
    }

    return payload
  }
}

// ─── Refresh Token Strategy ───────────────────────────────────────────────────
@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(Strategy, 'jwt-refresh') {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (req: Request) => req?.cookies?.['refresh_token'] ?? null,
        (req: Request) => {
          // Also accept from body
          return req?.body?.refreshToken ?? null
        },
      ]),
      secretOrKey: config.get<string>('JWT_REFRESH_SECRET'),
      passReqToCallback: true,
      ignoreExpiration: false,
    })
  }

  validate(
    req: Request,
    payload: JwtPayload
  ): JwtPayload & { refreshToken: string } {
    const refreshToken =
      req.cookies?.['refresh_token'] ?? req.body?.refreshToken

    return { ...payload, refreshToken }
  }
}
