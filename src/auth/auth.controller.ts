import {
  Controller,
  Post,
  Get,
  Body,
  Req,
  Res,
  HttpCode,
  HttpStatus,
  UseGuards,
  UsePipes,
  Logger,
} from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'
import { ConfigService } from '@nestjs/config'
import { Request, Response } from 'express'
import { Throttle } from '@nestjs/throttler'
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiCookieAuth,
} from '@nestjs/swagger'

import { AuthService } from './auth.service'
import {
  LoginSchema,
  RegisterSchema,
  ForgotPasswordSchema,
  ResetPasswordSchema,
  VerifyEmailSchema,
  ChangePasswordSchema,
  RefreshTokenSchema,
  type LoginDto,
  type RegisterDto,
  type ForgotPasswordDto,
  type ResetPasswordDto,
  type VerifyEmailDto,
  type ChangePasswordDto,
  type RefreshTokenDto,
} from './dto/auth.dto'
import { ZodValidationPipe } from '@/common/pipes/zod-validation.pipe'
import { JwtAuthGuard } from '@/common/guards'
import { Public } from '@/common/decorators/auth.decorators'
import {
  CurrentUser,
  CurrentUserId,
  type JwtPayload,
} from '@/common/decorators/current-user.decorator'

// Cookie helper
const COOKIE_OPTS = (config: ConfigService) => ({
  httpOnly: true,
  secure: config.get<boolean>('COOKIE_SECURE') ?? false,
  sameSite: config.get<'strict' | 'lax' | 'none'>('COOKIE_SAME_SITE') ?? 'lax',
  path: '/',
})

@ApiTags('Auth')
@Controller('auth')
@UseGuards(JwtAuthGuard)
export class AuthController {
  private readonly logger = new Logger(AuthController.name)

  constructor(
    private authService: AuthService,
    private config: ConfigService
  ) { }

  // ─── POST /auth/login ─────────────────────────────────────────────────────

  @Post('login')
  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60 } }) // 10 attempts/min
  @UsePipes(new ZodValidationPipe(LoginSchema))
  @ApiOperation({ summary: 'Login with email and password' })
  @ApiResponse({ status: 200, description: 'Login successful' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response
  ) {
    const { user, tokens } = await this.authService.login(dto, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    })

    // Set HTTP-only cookies
    res.cookie('auth_token', tokens.token, {
      ...COOKIE_OPTS(this.config),
      maxAge: 60 * 60 * 1000, // 1 hour
    })
    res.cookie('refresh_token', tokens.refreshToken, {
      ...COOKIE_OPTS(this.config),
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    })

    return { user, tokens }
  }

  // ─── POST /auth/register ──────────────────────────────────────────────────

  @Post('register')
  @Public()
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 5, ttl: 60 } })
  @UsePipes(new ZodValidationPipe(RegisterSchema))
  @ApiOperation({ summary: 'Register a new account' })
  @ApiResponse({ status: 201, description: 'Account created' })
  @ApiResponse({ status: 409, description: 'Email already exists' })
  async register(
    @Body() dto: RegisterDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response
  ) {
    const { user, tokens } = await this.authService.register(dto, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    })

    res.cookie('auth_token', tokens.token, {
      ...COOKIE_OPTS(this.config),
      maxAge: 60 * 60 * 1000,
    })
    res.cookie('refresh_token', tokens.refreshToken, {
      ...COOKIE_OPTS(this.config),
      maxAge: 7 * 24 * 60 * 60 * 1000,
    })

    return { user, tokens }
  }

  // ─── POST /auth/logout ────────────────────────────────────────────────────

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Logout current session' })
  @ApiBearerAuth()
  async logout(
    @CurrentUserId() userId: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response
  ) {
    const refreshToken = req.cookies?.['refresh_token']
    await this.authService.logout(userId, refreshToken)

    // Clear cookies
    res.clearCookie('auth_token', { path: '/' })
    res.clearCookie('refresh_token', { path: '/' })

    return { message: 'Logged out successfully' }
  }

  // ─── POST /auth/refresh ───────────────────────────────────────────────────

  @Post('refresh')
  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 20, ttl: 60 } })
  @ApiOperation({ summary: 'Refresh access token' })
  async refresh(
    @Body() body: Partial<RefreshTokenDto>,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response
  ) {
    // Accept refresh token from cookie OR body (matches frontend api.ts refresh flow)
    const refreshToken = req.cookies?.['refresh_token'] ?? body?.refreshToken

    if (!refreshToken) {
      return res
        .status(HttpStatus.UNAUTHORIZED)
        .json({ success: false, code: 'MISSING_REFRESH_TOKEN', message: 'Refresh token required' })
    }

    // Verify the refresh JWT to get userId
    let payload: JwtPayload
    try {
      payload = await import('@nestjs/jwt').then(({ JwtService }) => {
        const svc = new JwtService()
        return svc.verifyAsync(refreshToken, {
          secret: this.config.get<string>('JWT_REFRESH_SECRET'),
        }) as Promise<JwtPayload>
      })
    } catch {
      res.clearCookie('auth_token', { path: '/' })
      res.clearCookie('refresh_token', { path: '/' })
      return res.status(HttpStatus.UNAUTHORIZED).json({
        success: false,
        code: 'INVALID_REFRESH_TOKEN',
        message: 'Refresh token is invalid or expired',
      })
    }

    const tokens = await this.authService.refreshTokens(payload.sub, refreshToken, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    })

    res.cookie('auth_token', tokens.token, {
      ...COOKIE_OPTS(this.config),
      maxAge: 60 * 60 * 1000,
    })
    res.cookie('refresh_token', tokens.refreshToken, {
      ...COOKIE_OPTS(this.config),
      maxAge: 7 * 24 * 60 * 60 * 1000,
    })

    return { token: tokens.token, expiresAt: tokens.expiresAt }
  }

  // ─── GET /auth/me ─────────────────────────────────────────────────────────

  @Get('me')
  @ApiOperation({ summary: 'Get current authenticated user' })
  @ApiBearerAuth()
  async getMe(@CurrentUserId() userId: string) {
    return this.authService.getMe(userId)
  }

  // ─── POST /auth/forgot-password ───────────────────────────────────────────

  @Post('forgot-password')
  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 3, ttl: 60 } }) // 3 resets/min
  @UsePipes(new ZodValidationPipe(ForgotPasswordSchema))
  @ApiOperation({ summary: 'Request a password reset email' })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    await this.authService.forgotPassword(dto)
    // Always return same message (prevents email enumeration)
    return { message: 'If that email exists, a reset link has been sent' }
  }

  // ─── POST /auth/reset-password ────────────────────────────────────────────

  @Post('reset-password')
  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60 } })
  @UsePipes(new ZodValidationPipe(ResetPasswordSchema))
  @ApiOperation({ summary: 'Reset password using a reset token' })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    await this.authService.resetPassword(dto)
    return { message: 'Password reset successfully' }
  }

  // ─── POST /auth/change-password ───────────────────────────────────────────

  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @UsePipes(new ZodValidationPipe(ChangePasswordSchema))
  @ApiOperation({ summary: 'Change password (authenticated)' })
  @ApiBearerAuth()
  async changePassword(
    @CurrentUserId() userId: string,
    @Body() dto: ChangePasswordDto,
    @Res({ passthrough: true }) res: Response
  ) {
    await this.authService.changePassword(userId, dto)

    // Clear cookies to force re-login
    res.clearCookie('auth_token', { path: '/' })
    res.clearCookie('refresh_token', { path: '/' })

    return { message: 'Password changed successfully. Please sign in again.' }
  }

  // ─── POST /auth/verify-email ──────────────────────────────────────────────

  @Post('verify-email')
  @Public()
  @HttpCode(HttpStatus.OK)
  @UsePipes(new ZodValidationPipe(VerifyEmailSchema))
  @ApiOperation({ summary: 'Verify email address' })
  async verifyEmail(@Body() dto: VerifyEmailDto) {
    await this.authService.verifyEmail(dto)
    return { message: 'Email verified successfully' }
  }
}
