import { Test, TestingModule } from '@nestjs/testing'
import { ConfigService } from '@nestjs/config'
import { AuthController } from '@/auth/auth.controller'
import { AuthService } from '@/auth/auth.service'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const mockSafeUser = {
  id: 'user-1',
  email: 'test@example.com',
  name: 'Test User',
  role: 'user',
  permissions: ['dashboard:view', 'settings:view'],
  avatar: null,
  isEmailVerified: true,
  isActive: true,
  lastLoginAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
}

const mockTokens = {
  token: 'access.jwt.token',
  refreshToken: 'refresh.jwt.token',
  expiresAt: Date.now() + 3_600_000,
}

// ─── Request / Response mocks ─────────────────────────────────────────────────

const mockRequest = (overrides = {}) => ({
  ip: '127.0.0.1',
  headers: { 'user-agent': 'jest-test' },
  cookies: { refresh_token: 'existing.refresh.token' },
  body: {},
  ...overrides,
})

const mockResponse = () => {
  const res: Record<string, jest.Mock> = {}
  res.cookie = jest.fn().mockReturnValue(res)
  res.clearCookie = jest.fn().mockReturnValue(res)
  res.status = jest.fn().mockReturnValue(res)
  res.json = jest.fn().mockReturnValue(res)
  return res
}

// ─── Auth service mock ────────────────────────────────────────────────────────

const authServiceMock = {
  login: jest.fn().mockResolvedValue({ user: mockSafeUser, tokens: mockTokens }),
  register: jest.fn().mockResolvedValue({ user: mockSafeUser, tokens: mockTokens }),
  logout: jest.fn().mockResolvedValue(undefined),
  refreshTokens: jest.fn().mockResolvedValue(mockTokens),
  getMe: jest.fn().mockResolvedValue(mockSafeUser),
  forgotPassword: jest.fn().mockResolvedValue(undefined),
  resetPassword: jest.fn().mockResolvedValue(undefined),
  changePassword: jest.fn().mockResolvedValue(undefined),
  verifyEmail: jest.fn().mockResolvedValue(undefined),
}

const configServiceMock = {
  get: jest.fn((key: string) => {
    const map: Record<string, unknown> = {
      COOKIE_SECURE: false,
      COOKIE_SAME_SITE: 'lax',
    }
    return map[key]
  }),
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('AuthController', () => {
  let controller: AuthController

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: authServiceMock },
        { provide: ConfigService, useValue: configServiceMock },
      ],
    }).compile()

    controller = module.get<AuthController>(AuthController)
    jest.clearAllMocks()
    // Restore default mock implementations
    authServiceMock.login.mockResolvedValue({ user: mockSafeUser, tokens: mockTokens })
    authServiceMock.register.mockResolvedValue({ user: mockSafeUser, tokens: mockTokens })
  })

  // ─── login ───────────────────────────────────────────────────────────────

  describe('POST /auth/login', () => {
    const loginDto = { email: 'test@example.com', password: 'Password@1', rememberMe: false }

    it('calls authService.login with dto and request meta', async () => {
      const req = mockRequest() as any
      const res = mockResponse() as any

      await controller.login(loginDto, req, res)

      expect(authServiceMock.login).toHaveBeenCalledWith(loginDto, {
        ip: '127.0.0.1',
        userAgent: 'jest-test',
      })
    })

    it('sets auth_token cookie on success', async () => {
      const req = mockRequest() as any
      const res = mockResponse() as any

      await controller.login(loginDto, req, res)

      expect(res.cookie).toHaveBeenCalledWith(
        'auth_token',
        mockTokens.token,
        expect.objectContaining({ httpOnly: true })
      )
    })

    it('sets refresh_token cookie on success', async () => {
      const req = mockRequest() as any
      const res = mockResponse() as any

      await controller.login(loginDto, req, res)

      expect(res.cookie).toHaveBeenCalledWith(
        'refresh_token',
        mockTokens.refreshToken,
        expect.objectContaining({ httpOnly: true })
      )
    })

    it('returns user and tokens', async () => {
      const req = mockRequest() as any
      const res = mockResponse() as any

      const result = await controller.login(loginDto, req, res)

      expect(result).toEqual({ user: mockSafeUser, tokens: mockTokens })
    })
  })

  // ─── register ────────────────────────────────────────────────────────────

  describe('POST /auth/register', () => {
    const registerDto = {
      name: 'New User',
      email: 'new@example.com',
      password: 'Password@1',
      confirmPassword: 'Password@1',
    }

    it('calls authService.register and sets cookies', async () => {
      const req = mockRequest() as any
      const res = mockResponse() as any

      const result = await controller.register(registerDto, req, res)

      expect(authServiceMock.register).toHaveBeenCalledWith(registerDto, {
        ip: '127.0.0.1',
        userAgent: 'jest-test',
      })
      expect(res.cookie).toHaveBeenCalledTimes(2)
      expect(result).toHaveProperty('user')
      expect(result).toHaveProperty('tokens')
    })
  })

  // ─── logout ───────────────────────────────────────────────────────────────

  describe('POST /auth/logout', () => {
    it('calls authService.logout with userId and cookie refresh token', async () => {
      const req = mockRequest({ cookies: { refresh_token: 'old.refresh.token' } }) as any
      const res = mockResponse() as any

      await controller.logout('user-1', req, res)

      expect(authServiceMock.logout).toHaveBeenCalledWith('user-1', 'old.refresh.token')
    })

    it('clears both cookies on logout', async () => {
      const req = mockRequest() as any
      const res = mockResponse() as any

      await controller.logout('user-1', req, res)

      expect(res.clearCookie).toHaveBeenCalledWith('auth_token', { path: '/' })
      expect(res.clearCookie).toHaveBeenCalledWith('refresh_token', { path: '/' })
    })
  })

  // ─── getMe ────────────────────────────────────────────────────────────────

  describe('GET /auth/me', () => {
    it('returns current user', async () => {
      const result = await controller.getMe('user-1')
      expect(authServiceMock.getMe).toHaveBeenCalledWith('user-1')
      expect(result).toEqual(mockSafeUser)
    })
  })

  // ─── forgotPassword ───────────────────────────────────────────────────────

  describe('POST /auth/forgot-password', () => {
    it('calls authService.forgotPassword and returns generic message', async () => {
      const result = await controller.forgotPassword({ email: 'user@example.com' })
      expect(authServiceMock.forgotPassword).toHaveBeenCalled()
      expect(result).toHaveProperty('message')
    })
  })

  // ─── verifyEmail ──────────────────────────────────────────────────────────

  describe('POST /auth/verify-email', () => {
    it('calls authService.verifyEmail', async () => {
      const result = await controller.verifyEmail({ token: 'valid-token' })
      expect(authServiceMock.verifyEmail).toHaveBeenCalledWith({ token: 'valid-token' })
      expect(result).toHaveProperty('message')
    })
  })

  // ─── changePassword ───────────────────────────────────────────────────────

  describe('POST /auth/change-password', () => {
    it('clears cookies after password change', async () => {
      const res = mockResponse() as any
      const dto = {
        currentPassword: 'Old@pass1',
        newPassword: 'New@pass1',
        confirmPassword: 'New@pass1',
      }

      await controller.changePassword('user-1', dto, res)

      expect(authServiceMock.changePassword).toHaveBeenCalledWith('user-1', dto)
      expect(res.clearCookie).toHaveBeenCalledWith('auth_token', { path: '/' })
      expect(res.clearCookie).toHaveBeenCalledWith('refresh_token', { path: '/' })
    })
  })
})
