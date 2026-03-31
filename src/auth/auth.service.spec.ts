import { Test, TestingModule } from '@nestjs/testing'
import { JwtService } from '@nestjs/jwt'
import { ConfigService } from '@nestjs/config'
import {
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common'
import { AuthService } from '@/auth/auth.service'
import { PrismaService } from '@/prisma/prisma.service'
import { ActivityAction } from '@prisma/client'
import * as bcrypt from 'bcryptjs'

// ─── Mock factories ───────────────────────────────────────────────────────────

const mockUser = {
  id: 'user-uuid-1',
  email: 'test@example.com',
  name: 'Test User',
  password: '$2a$12$hashedpassword',
  role: 'user' as const,
  avatar: null,
  isEmailVerified: true,
  isActive: true,
  lastLoginAt: null,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  preferences: {
    id: 'pref-1',
    userId: 'user-uuid-1',
    theme: 'system',
    language: 'en',
    emailNotifications: true,
    pushNotifications: true,
    inAppNotifications: true,
  },
}

const mockRefreshToken = {
  id: 'rt-uuid-1',
  token: 'valid.refresh.token',
  userId: 'user-uuid-1',
  expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  isRevoked: false,
  userAgent: 'jest-test',
  ipAddress: '127.0.0.1',
  createdAt: new Date(),
  user: mockUser,
}

// ─── Prisma mock ─────────────────────────────────────────────────────────────

const prismaMock = {
  user: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
  refreshToken: {
    create: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    deleteMany: jest.fn(),
  },
  passwordReset: {
    create: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
  emailVerification: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  activityLog: {
    create: jest.fn(),
  },
  $transaction: jest.fn(),
}

const jwtMock = {
  signAsync: jest.fn().mockResolvedValue('signed.jwt.token'),
  verifyAsync: jest.fn(),
}

const configMock = {
  get: jest.fn((key: string) => {
    const map: Record<string, unknown> = {
      JWT_ACCESS_SECRET: 'test-access-secret',
      JWT_REFRESH_SECRET: 'test-refresh-secret',
      JWT_ACCESS_EXPIRES_IN: '1h',
      JWT_REFRESH_EXPIRES_IN: '7d',
      BCRYPT_ROUNDS: 10,
    }
    return map[key]
  }),
}

// ─── Test Suite ───────────────────────────────────────────────────────────────

describe('AuthService', () => {
  let service: AuthService

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: JwtService, useValue: jwtMock },
        { provide: ConfigService, useValue: configMock },
      ],
    }).compile()

    service = module.get<AuthService>(AuthService)
    jest.clearAllMocks()
  })

  // ─── validateUser ────────────────────────────────────────────────────────

  describe('validateUser', () => {
    it('returns safe user on valid credentials', async () => {
      prismaMock.user.findUnique.mockResolvedValue(mockUser)
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(true as never)

      const result = await service.validateUser('test@example.com', 'Password@1')

      expect(result).toBeDefined()
      expect(result).not.toHaveProperty('password')
      expect(result?.email).toBe(mockUser.email)
    })

    it('returns null for non-existent user', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null)
      const result = await service.validateUser('nobody@example.com', 'pass')
      expect(result).toBeNull()
    })

    it('returns null for wrong password', async () => {
      prismaMock.user.findUnique.mockResolvedValue(mockUser)
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(false as never)
      const result = await service.validateUser('test@example.com', 'wrong')
      expect(result).toBeNull()
    })

    it('returns null for inactive user', async () => {
      prismaMock.user.findUnique.mockResolvedValue({ ...mockUser, isActive: false })
      const result = await service.validateUser('test@example.com', 'pass')
      expect(result).toBeNull()
    })
  })

  // ─── login ───────────────────────────────────────────────────────────────

  describe('login', () => {
    const loginDto = {
      email: 'test@example.com',
      password: 'Password@1',
      rememberMe: false,
    }

    beforeEach(() => {
      prismaMock.user.findUnique.mockResolvedValue(mockUser)
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(true as never)
      prismaMock.user.update.mockResolvedValue(mockUser)
      prismaMock.activityLog.create.mockResolvedValue({})
      prismaMock.refreshToken.deleteMany.mockResolvedValue({ count: 0 })
      prismaMock.refreshToken.create.mockResolvedValue(mockRefreshToken)
    })

    it('returns user and tokens on success', async () => {
      const result = await service.login(loginDto)

      expect(result).toHaveProperty('user')
      expect(result).toHaveProperty('tokens')
      expect(result.user).not.toHaveProperty('password')
      expect(result.tokens).toHaveProperty('token')
      expect(result.tokens).toHaveProperty('refreshToken')
      expect(result.tokens).toHaveProperty('expiresAt')
      expect(typeof result.tokens.expiresAt).toBe('number')
    })

    it('attaches permissions based on role', async () => {
      const result = await service.login(loginDto)
      expect(result.user.permissions).toContain('dashboard:view')
    })

    it('throws UnauthorizedException for unknown email', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null)
      await expect(service.login(loginDto)).rejects.toThrow(UnauthorizedException)
    })

    it('throws UnauthorizedException for wrong password', async () => {
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(false as never)
      await expect(service.login(loginDto)).rejects.toThrow(UnauthorizedException)
    })

    it('throws UnauthorizedException for inactive account', async () => {
      prismaMock.user.findUnique.mockResolvedValue({ ...mockUser, isActive: false })
      await expect(service.login(loginDto)).rejects.toThrow(UnauthorizedException)
    })

    it('logs USER_LOGIN activity', async () => {
      await service.login(loginDto, { ip: '127.0.0.1' })
      expect(prismaMock.activityLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: ActivityAction.USER_LOGIN }),
        })
      )
    })

    it('updates lastLoginAt timestamp', async () => {
      await service.login(loginDto)
      expect(prismaMock.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ lastLoginAt: expect.any(Date) }),
        })
      )
    })
  })

  // ─── register ────────────────────────────────────────────────────────────

  describe('register', () => {
    const registerDto = {
      name: 'New User',
      email: 'new@example.com',
      password: 'Password@1',
      confirmPassword: 'Password@1',
    }

    beforeEach(() => {
      prismaMock.user.findUnique.mockResolvedValue(null) // no existing user
      jest.spyOn(bcrypt, 'hash').mockResolvedValue('$hashed' as never)
      prismaMock.user.create.mockResolvedValue({
        ...mockUser,
        id: 'new-user-id',
        email: registerDto.email,
        name: registerDto.name,
      })
      prismaMock.activityLog.create.mockResolvedValue({})
      prismaMock.refreshToken.deleteMany.mockResolvedValue({ count: 0 })
      prismaMock.refreshToken.create.mockResolvedValue(mockRefreshToken)
    })

    it('creates user and returns tokens', async () => {
      const result = await service.register(registerDto)
      expect(result.user.email).toBe(registerDto.email)
      expect(result.tokens).toHaveProperty('token')
      expect(result.tokens).toHaveProperty('refreshToken')
    })

    it('hashes password before saving', async () => {
      await service.register(registerDto)
      expect(bcrypt.hash).toHaveBeenCalledWith(registerDto.password, 10)
    })

    it('throws ConflictException for duplicate email', async () => {
      prismaMock.user.findUnique.mockResolvedValue(mockUser)
      await expect(service.register(registerDto)).rejects.toThrow(ConflictException)
    })

    it('assigns user role by default', async () => {
      await service.register(registerDto)
      expect(prismaMock.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ role: 'user' }),
        })
      )
    })
  })

  // ─── refreshTokens ────────────────────────────────────────────────────────

  describe('refreshTokens', () => {
    beforeEach(() => {
      prismaMock.refreshToken.findUnique.mockResolvedValue(mockRefreshToken)
      prismaMock.refreshToken.update.mockResolvedValue({ ...mockRefreshToken, isRevoked: true })
      prismaMock.refreshToken.deleteMany.mockResolvedValue({ count: 0 })
      prismaMock.refreshToken.create.mockResolvedValue(mockRefreshToken)
    })

    it('returns new tokens on valid refresh token', async () => {
      const result = await service.refreshTokens('user-uuid-1', 'valid.refresh.token')
      expect(result).toHaveProperty('token')
      expect(result).toHaveProperty('refreshToken')
    })

    it('revokes old refresh token (rotation)', async () => {
      await service.refreshTokens('user-uuid-1', 'valid.refresh.token')
      expect(prismaMock.refreshToken.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { isRevoked: true },
        })
      )
    })

    it('throws for revoked token', async () => {
      prismaMock.refreshToken.findUnique.mockResolvedValue({
        ...mockRefreshToken,
        isRevoked: true,
      })
      await expect(
        service.refreshTokens('user-uuid-1', 'valid.refresh.token')
      ).rejects.toThrow(UnauthorizedException)
    })

    it('throws for expired token', async () => {
      prismaMock.refreshToken.findUnique.mockResolvedValue({
        ...mockRefreshToken,
        expiresAt: new Date(Date.now() - 1000),
      })
      await expect(
        service.refreshTokens('user-uuid-1', 'valid.refresh.token')
      ).rejects.toThrow(UnauthorizedException)
    })

    it('throws for user/token mismatch', async () => {
      prismaMock.refreshToken.findUnique.mockResolvedValue({
        ...mockRefreshToken,
        userId: 'different-user-id',
      })
      await expect(
        service.refreshTokens('user-uuid-1', 'valid.refresh.token')
      ).rejects.toThrow(UnauthorizedException)
    })
  })

  // ─── logout ───────────────────────────────────────────────────────────────

  describe('logout', () => {
    it('revokes specific refresh token', async () => {
      prismaMock.refreshToken.updateMany.mockResolvedValue({ count: 1 })
      prismaMock.activityLog.create.mockResolvedValue({})

      await service.logout('user-uuid-1', 'some.refresh.token')

      expect(prismaMock.refreshToken.updateMany).toHaveBeenCalledWith({
        where: {
          userId: 'user-uuid-1',
          token: 'some.refresh.token',
          isRevoked: false,
        },
        data: { isRevoked: true },
      })
    })

    it('revokes all tokens when no specific token provided', async () => {
      prismaMock.refreshToken.updateMany.mockResolvedValue({ count: 3 })
      prismaMock.activityLog.create.mockResolvedValue({})

      await service.logout('user-uuid-1')

      expect(prismaMock.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-uuid-1', isRevoked: false },
        data: { isRevoked: true },
      })
    })
  })

  // ─── forgotPassword ───────────────────────────────────────────────────────

  describe('forgotPassword', () => {
    it('creates reset token for valid user', async () => {
      prismaMock.user.findUnique.mockResolvedValue(mockUser)
      prismaMock.passwordReset.updateMany.mockResolvedValue({ count: 0 })
      prismaMock.passwordReset.create.mockResolvedValue({})
      prismaMock.activityLog.create.mockResolvedValue({})

      await expect(
        service.forgotPassword({ email: 'test@example.com' })
      ).resolves.toBeUndefined()

      expect(prismaMock.passwordReset.create).toHaveBeenCalled()
    })

    it('returns silently for unknown email (no enumeration)', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null)
      await expect(
        service.forgotPassword({ email: 'unknown@example.com' })
      ).resolves.toBeUndefined()
      expect(prismaMock.passwordReset.create).not.toHaveBeenCalled()
    })
  })

  // ─── resetPassword ────────────────────────────────────────────────────────

  describe('resetPassword', () => {
    const validReset = {
      token: 'valid-reset-token',
      password: 'NewPassword@1',
      confirmPassword: 'NewPassword@1',
    }

    it('resets password with valid token', async () => {
      prismaMock.passwordReset.findUnique.mockResolvedValue({
        id: 'reset-1',
        token: validReset.token,
        userId: 'user-uuid-1',
        expiresAt: new Date(Date.now() + 3600_000),
        usedAt: null,
        user: mockUser,
      })
      jest.spyOn(bcrypt, 'hash').mockResolvedValue('$new_hashed' as never)
      prismaMock.$transaction.mockImplementation(async (ops: unknown[]) => {
        for (const op of ops) await op
      })
      prismaMock.passwordReset.update.mockResolvedValue({})
      prismaMock.user.update.mockResolvedValue(mockUser)
      prismaMock.refreshToken.updateMany.mockResolvedValue({ count: 1 })
      prismaMock.activityLog.create.mockResolvedValue({})

      await expect(service.resetPassword(validReset)).resolves.toBeUndefined()
    })

    it('throws for invalid/expired token', async () => {
      prismaMock.passwordReset.findUnique.mockResolvedValue(null)
      await expect(service.resetPassword(validReset)).rejects.toThrow(BadRequestException)
    })

    it('throws for already-used token', async () => {
      prismaMock.passwordReset.findUnique.mockResolvedValue({
        id: 'reset-1',
        token: validReset.token,
        userId: 'user-uuid-1',
        expiresAt: new Date(Date.now() + 3600_000),
        usedAt: new Date(), // already used
        user: mockUser,
      })
      await expect(service.resetPassword(validReset)).rejects.toThrow(BadRequestException)
    })
  })

  // ─── getMe ────────────────────────────────────────────────────────────────

  describe('getMe', () => {
    it('returns safe user without password', async () => {
      prismaMock.user.findUnique.mockResolvedValue(mockUser)
      const result = await service.getMe('user-uuid-1')
      expect(result).not.toHaveProperty('password')
      expect(result.id).toBe('user-uuid-1')
    })

    it('throws NotFoundException for unknown user', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null)
      await expect(service.getMe('unknown-id')).rejects.toThrow(NotFoundException)
    })
  })
})
