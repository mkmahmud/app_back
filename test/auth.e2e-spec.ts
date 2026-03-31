import { Test, TestingModule } from '@nestjs/testing'
import { INestApplication, ValidationPipe } from '@nestjs/common'
import * as request from 'supertest'
import * as cookieParser from 'cookie-parser'
import { AppModule } from '@/app.module'
import { PrismaService } from '@/prisma/prisma.service'
import { APP_FILTER, APP_INTERCEPTOR, Reflector } from '@nestjs/core'
import { AllExceptionsFilter } from '@/common/filters/all-exceptions.filter'
import { TransformInterceptor } from '@/common/interceptors/transform.interceptor'
import * as bcrypt from 'bcryptjs'

// ─────────────────────────────────────────────────────────────────────────────
// NOTE: These E2E tests run against a real database (test DB).
// Set DATABASE_URL in your .env.test file.
// Run with: jest --config test/jest-e2e.json
// ─────────────────────────────────────────────────────────────────────────────

describe('Auth E2E', () => {
  let app: INestApplication
  let prisma: PrismaService
  let testUserId: string

  const testEmail = `e2e_${Date.now()}@test.com`
  const testPassword = 'E2ETest@123'

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile()

    app = moduleFixture.createNestApplication()

    // Same setup as main.ts
    app.use(cookieParser(process.env.COOKIE_SECRET ?? 'test-secret'))
    app.setGlobalPrefix('api')
    app.useGlobalFilters(new AllExceptionsFilter())
    app.useGlobalInterceptors(
      new TransformInterceptor(app.get(Reflector))
    )

    await app.init()
    prisma = app.get(PrismaService)
  })

  afterAll(async () => {
    // Cleanup test user
    if (testUserId) {
      await prisma.user.delete({ where: { id: testUserId } }).catch(() => null)
    }
    await app.close()
  })

  // ─── Register ─────────────────────────────────────────────────────────────

  describe('POST /api/auth/register', () => {
    it('registers a new user and returns tokens', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          name: 'E2E User',
          email: testEmail,
          password: testPassword,
          confirmPassword: testPassword,
        })
        .expect(201)

      expect(res.body.success).toBe(true)
      expect(res.body.data.user.email).toBe(testEmail)
      expect(res.body.data.user).not.toHaveProperty('password')
      expect(res.body.data.tokens).toHaveProperty('token')
      expect(res.body.data.tokens).toHaveProperty('refreshToken')
      expect(res.body.data.tokens).toHaveProperty('expiresAt')
      expect(typeof res.body.data.tokens.expiresAt).toBe('number')

      // Verify cookies were set
      const cookies = Array.isArray(res.headers['set-cookie'])
        ? res.headers['set-cookie']
        : typeof res.headers['set-cookie'] === 'string'
          ? [res.headers['set-cookie']]
          : [];
      expect(cookies.some((c: string) => c.startsWith('auth_token='))).toBe(true)
      expect(cookies.some((c: string) => c.startsWith('refresh_token='))).toBe(true)
      expect(cookies.some((c: string) => c.includes('HttpOnly'))).toBe(true)

      testUserId = res.body.data.user.id
    })

    it('returns 409 for duplicate email', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          name: 'Duplicate',
          email: testEmail,
          password: testPassword,
          confirmPassword: testPassword,
        })
        .expect(409)

      expect(res.body.success).toBe(false)
      expect(res.body.code).toBe('EMAIL_ALREADY_EXISTS')
    })

    it('returns 400 for invalid email', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          name: 'Bad User',
          email: 'not-an-email',
          password: testPassword,
          confirmPassword: testPassword,
        })
        .expect(400)

      expect(res.body.success).toBe(false)
      expect(res.body.code).toBe('VALIDATION_ERROR')
    })

    it('returns 400 for mismatched passwords', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          name: 'Bad User',
          email: `other_${Date.now()}@test.com`,
          password: testPassword,
          confirmPassword: 'different',
        })
        .expect(400)

      expect(res.body.success).toBe(false)
    })

    it('returns 400 for weak password', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          name: 'Bad User',
          email: `weak_${Date.now()}@test.com`,
          password: 'weakpass',
          confirmPassword: 'weakpass',
        })
        .expect(400)

      expect(res.body.success).toBe(false)
    })
  })

  // ─── Login ────────────────────────────────────────────────────────────────

  describe('POST /api/auth/login', () => {
    it('logs in with correct credentials', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: testEmail, password: testPassword })
        .expect(200)

      expect(res.body.success).toBe(true)
      expect(res.body.data.user.email).toBe(testEmail)
      expect(res.body.data.user).not.toHaveProperty('password')
      expect(res.body.data.tokens).toHaveProperty('token')
      expect(Array.isArray(res.body.data.user.permissions)).toBe(true)
    })

    it('returns 401 for wrong password', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: testEmail, password: 'WrongPass@1' })
        .expect(401)

      expect(res.body.success).toBe(false)
      expect(res.body.code).toBe('INVALID_CREDENTIALS')
    })

    it('returns 401 for non-existent email', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'nobody@nowhere.com', password: testPassword })
        .expect(401)

      expect(res.body.success).toBe(false)
    })

    it('returns 400 for missing email', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ password: testPassword })
        .expect(400)
    })
  })

  // ─── GET /auth/me ─────────────────────────────────────────────────────────

  describe('GET /api/auth/me', () => {
    let accessToken: string

    beforeAll(async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: testEmail, password: testPassword })
      accessToken = res.body.data.tokens.token
    })

    it('returns current user with valid token', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200)

      expect(res.body.success).toBe(true)
      expect(res.body.data.email).toBe(testEmail)
      expect(res.body.data).not.toHaveProperty('password')
    })

    it('returns 401 without token', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/auth/me')
        .expect(401)

      expect(res.body.success).toBe(false)
      expect(res.body.code).toBe('UNAUTHORIZED')
    })

    it('returns 401 with invalid token', async () => {
      await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Authorization', 'Bearer invalid.token.here')
        .expect(401)
    })
  })

  // ─── Logout ───────────────────────────────────────────────────────────────

  describe('POST /api/auth/logout', () => {
    it('logs out and clears cookies', async () => {
      const loginRes = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: testEmail, password: testPassword })

      const token = loginRes.body.data.tokens.token

      const res = await request(app.getHttpServer())
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${token}`)
        .expect(200)

      expect(res.body.success).toBe(true)

      const cookies = Array.isArray(res.headers['set-cookie'])
        ? res.headers['set-cookie']
        : typeof res.headers['set-cookie'] === 'string'
          ? [res.headers['set-cookie']]
          : [];
      // Cookies should be cleared (expires in past or empty)
      if (cookies) {
        const authCookie = cookies.find((c: string) => c.startsWith('auth_token='))
        expect(authCookie).toContain('auth_token=;')
      }
    })
  })

  // ─── Forgot Password ──────────────────────────────────────────────────────

  describe('POST /api/auth/forgot-password', () => {
    it('returns 200 for valid email (no enumeration)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/forgot-password')
        .send({ email: testEmail })
        .expect(200)

      expect(res.body.success).toBe(true)
    })

    it('returns 200 even for unknown email (prevents enumeration)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/forgot-password')
        .send({ email: 'ghost@nowhere.com' })
        .expect(200)

      expect(res.body.success).toBe(true)
    })

    it('returns 400 for invalid email format', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/forgot-password')
        .send({ email: 'not-email' })
        .expect(400)
    })
  })
})
