import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { ConfigService } from '@nestjs/config'
import { PrismaService } from '@/prisma/prisma.service'
import { getPermissionsForRole } from '@/config/roles.config'
import type { Role } from '@/config/roles.config'
import type {
  LoginDto,
  RegisterDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  VerifyEmailDto,
  ChangePasswordDto,
  RefreshTokenDto,
} from './dto/auth.dto'
import type { JwtPayload } from '@/common/decorators/current-user.decorator'
import { ActivityAction, User } from '@prisma/client'
import * as bcrypt from 'bcryptjs'
import { v4 as uuidv4 } from 'uuid'
import { addDays, addHours } from 'date-fns'

// ─── Types ────────────────────────────────────────────────────────────────────

export type SafeUser = Omit<User, 'password'> & { permissions: string[] }

export interface AuthTokens {
  token: string
  refreshToken: string
  expiresAt: number
}

export interface AuthResponse {
  user: SafeUser
  tokens: AuthTokens
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name)

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private config: ConfigService
  ) {}

  // ─── Validate credentials (used by LocalStrategy) ─────────────────────────

  async validateUser(email: string, password: string): Promise<SafeUser | null> {
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      include: { preferences: true },
    })

    if (!user || !user.isActive) return null

    const isMatch = await bcrypt.compare(password, user.password)
    if (!isMatch) return null

    return this.toSafeUser(user)
  }

  // ─── Login ────────────────────────────────────────────────────────────────

  async login(
    dto: LoginDto,
    meta: { ip?: string; userAgent?: string } = {}
  ): Promise<AuthResponse> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      include: { preferences: true },
    })

    if (!user || !user.isActive) {
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password',
      })
    }

    const isMatch = await bcrypt.compare(dto.password, user.password)
    if (!isMatch) {
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password',
      })
    }

    // Update last login timestamp
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    })

    // Log activity
    await this.logActivity(user.id, ActivityAction.USER_LOGIN, {
      ip: meta.ip,
      userAgent: meta.userAgent,
    })

    const tokens = await this.generateTokens(user.id, user.email, user.role)
    await this.saveRefreshToken(user.id, tokens.refreshToken, meta)

    return { user: this.toSafeUser(user), tokens }
  }

  // ─── Register ────────────────────────────────────────────────────────────

  async register(
    dto: RegisterDto,
    meta: { ip?: string; userAgent?: string } = {}
  ): Promise<AuthResponse> {
    // Check existing email
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    })
    if (existing) {
      throw new ConflictException({
        code: 'EMAIL_ALREADY_EXISTS',
        message: 'An account with this email already exists',
      })
    }

    const bcryptRounds = this.config.get<number>('BCRYPT_ROUNDS') ?? 12
    const hashedPassword = await bcrypt.hash(dto.password, bcryptRounds)

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        name: dto.name,
        password: hashedPassword,
        role: 'user',
        preferences: {
          create: {
            theme: 'system',
            language: 'en',
            emailNotifications: true,
            pushNotifications: true,
            inAppNotifications: true,
          },
        },
      },
      include: { preferences: true },
    })

    // Log activity
    await this.logActivity(user.id, ActivityAction.USER_CREATED, {
      ip: meta.ip,
      userAgent: meta.userAgent,
    })

    const tokens = await this.generateTokens(user.id, user.email, user.role)
    await this.saveRefreshToken(user.id, tokens.refreshToken, meta)

    return { user: this.toSafeUser(user), tokens }
  }

  // ─── Refresh Token ────────────────────────────────────────────────────────

  async refreshTokens(
    userId: string,
    refreshToken: string,
    meta: { ip?: string; userAgent?: string } = {}
  ): Promise<AuthTokens> {
    // Find stored refresh token
    const stored = await this.prisma.refreshToken.findUnique({
      where: { token: refreshToken },
      include: { user: true },
    })

    if (
      !stored ||
      stored.isRevoked ||
      stored.userId !== userId ||
      stored.expiresAt < new Date()
    ) {
      throw new UnauthorizedException({
        code: 'INVALID_REFRESH_TOKEN',
        message: 'Invalid or expired refresh token',
      })
    }

    if (!stored.user.isActive) {
      throw new UnauthorizedException({
        code: 'ACCOUNT_INACTIVE',
        message: 'Account is inactive',
      })
    }

    // Rotate refresh token (revoke old, issue new)
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { isRevoked: true },
    })

    const tokens = await this.generateTokens(
      stored.user.id,
      stored.user.email,
      stored.user.role
    )
    await this.saveRefreshToken(stored.user.id, tokens.refreshToken, meta)

    return tokens
  }

  // ─── Logout ───────────────────────────────────────────────────────────────

  async logout(userId: string, refreshToken?: string): Promise<void> {
    if (refreshToken) {
      // Revoke specific token
      await this.prisma.refreshToken.updateMany({
        where: { userId, token: refreshToken, isRevoked: false },
        data: { isRevoked: true },
      })
    } else {
      // Revoke ALL refresh tokens (logout everywhere)
      await this.prisma.refreshToken.updateMany({
        where: { userId, isRevoked: false },
        data: { isRevoked: true },
      })
    }

    await this.logActivity(userId, ActivityAction.USER_LOGOUT)
  }

  // ─── Get current user ─────────────────────────────────────────────────────

  async getMe(userId: string): Promise<SafeUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { preferences: true },
    })

    if (!user) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'User not found' })
    }

    return this.toSafeUser(user)
  }

  // ─── Forgot Password ──────────────────────────────────────────────────────

  async forgotPassword(dto: ForgotPasswordDto): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    })

    // Always return success to prevent email enumeration
    if (!user || !user.isActive) return

    // Invalidate existing reset tokens
    await this.prisma.passwordReset.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    })

    const token = uuidv4()
    await this.prisma.passwordReset.create({
      data: {
        token,
        userId: user.id,
        expiresAt: addHours(new Date(), 1), // 1 hour
      },
    })

    await this.logActivity(user.id, ActivityAction.PASSWORD_RESET_REQUESTED)

    // TODO: Send email with reset link
    this.logger.log(`Password reset token for ${user.email}: ${token}`)
  }

  // ─── Reset Password ───────────────────────────────────────────────────────

  async resetPassword(dto: ResetPasswordDto): Promise<void> {
    const resetRecord = await this.prisma.passwordReset.findUnique({
      where: { token: dto.token },
      include: { user: true },
    })

    if (
      !resetRecord ||
      resetRecord.usedAt !== null ||
      resetRecord.expiresAt < new Date()
    ) {
      throw new BadRequestException({
        code: 'INVALID_TOKEN',
        message: 'Password reset token is invalid or has expired',
      })
    }

    const bcryptRounds = this.config.get<number>('BCRYPT_ROUNDS') ?? 12
    const hashedPassword = await bcrypt.hash(dto.password, bcryptRounds)

    await this.prisma.$transaction([
      // Mark token as used
      this.prisma.passwordReset.update({
        where: { id: resetRecord.id },
        data: { usedAt: new Date() },
      }),
      // Update password
      this.prisma.user.update({
        where: { id: resetRecord.userId },
        data: { password: hashedPassword },
      }),
      // Revoke all refresh tokens (force re-login everywhere)
      this.prisma.refreshToken.updateMany({
        where: { userId: resetRecord.userId },
        data: { isRevoked: true },
      }),
    ])

    await this.logActivity(resetRecord.userId, ActivityAction.PASSWORD_CHANGED)
  }

  // ─── Change Password ──────────────────────────────────────────────────────

  async changePassword(userId: string, dto: ChangePasswordDto): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    })

    const isMatch = await bcrypt.compare(dto.currentPassword, user.password)
    if (!isMatch) {
      throw new BadRequestException({
        code: 'INVALID_PASSWORD',
        message: 'Current password is incorrect',
      })
    }

    const bcryptRounds = this.config.get<number>('BCRYPT_ROUNDS') ?? 12
    const hashedPassword = await bcrypt.hash(dto.newPassword, bcryptRounds)

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { password: hashedPassword },
      }),
      // Revoke all refresh tokens
      this.prisma.refreshToken.updateMany({
        where: { userId, isRevoked: false },
        data: { isRevoked: true },
      }),
    ])

    await this.logActivity(userId, ActivityAction.PASSWORD_CHANGED)
  }

  // ─── Verify Email ─────────────────────────────────────────────────────────

  async verifyEmail(dto: VerifyEmailDto): Promise<void> {
    const record = await this.prisma.emailVerification.findUnique({
      where: { token: dto.token },
    })

    if (!record || record.usedAt !== null || record.expiresAt < new Date()) {
      throw new BadRequestException({
        code: 'INVALID_TOKEN',
        message: 'Email verification token is invalid or has expired',
      })
    }

    await this.prisma.$transaction([
      this.prisma.emailVerification.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
      this.prisma.user.update({
        where: { id: record.userId },
        data: { isEmailVerified: true },
      }),
    ])

    await this.logActivity(record.userId, ActivityAction.EMAIL_VERIFIED)
  }

  // ─── Private Helpers ──────────────────────────────────────────────────────

  private async generateTokens(
    userId: string,
    email: string,
    role: string
  ): Promise<AuthTokens> {
    const payload: JwtPayload = { sub: userId, email, role }
    const accessExpiresIn = this.config.get<string>('JWT_ACCESS_EXPIRES_IN') ?? '1h'
    const refreshExpiresIn = this.config.get<string>('JWT_REFRESH_EXPIRES_IN') ?? '7d'

    const [token, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.config.get<string>('JWT_ACCESS_SECRET'),
        expiresIn: accessExpiresIn,
      }),
      this.jwtService.signAsync(payload, {
        secret: this.config.get<string>('JWT_REFRESH_SECRET'),
        expiresIn: refreshExpiresIn,
      }),
    ])

    // Calculate expiry timestamp for frontend (1h = 3600s)
    const expiresAt = Date.now() + 60 * 60 * 1000

    return { token, refreshToken, expiresAt }
  }

  private async saveRefreshToken(
    userId: string,
    token: string,
    meta: { ip?: string; userAgent?: string } = {}
  ): Promise<void> {
    // Delete expired tokens for this user (cleanup)
    await this.prisma.refreshToken.deleteMany({
      where: { userId, expiresAt: { lt: new Date() } },
    })

    await this.prisma.refreshToken.create({
      data: {
        token,
        userId,
        expiresAt: addDays(new Date(), 7),
        ipAddress: meta.ip,
        userAgent: meta.userAgent,
      },
    })
  }

  private toSafeUser(user: User & { preferences?: unknown }): SafeUser {
    const { password: _, ...safe } = user
    return {
      ...safe,
      permissions: getPermissionsForRole(user.role as Role),
    }
  }

  private async logActivity(
    userId: string,
    action: ActivityAction,
    meta: { ip?: string; userAgent?: string; targetId?: string; targetName?: string } = {}
  ): Promise<void> {
    try {
      await this.prisma.activityLog.create({
        data: {
          userId,
          action,
          targetId: meta.targetId,
          targetName: meta.targetName,
          ipAddress: meta.ip,
          userAgent: meta.userAgent,
        },
      })
    } catch (err) {
      // Never fail a request because of activity logging
      this.logger.warn('Failed to log activity', err)
    }
  }
}
