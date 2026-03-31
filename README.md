# Buddy Script Backend — NestJS + PostgreSQL + Prisma

Production-ready **NestJS 10** REST API backend for the Buddy Script. Fully typed with TypeScript, validated with **Zod**, persisted with **Prisma + PostgreSQL**, and secured with JWT, RBAC, rate limiting, and Helmet.

---

## 🗺️ Database Design (ERD)

![Database ERD](./ERD.png)

---

## 🗂️ Project Structure

```
src/
├── auth/
│   ├── dto/             auth.dto.ts          — Zod schemas for all auth inputs
│   ├── strategies/      jwt.strategy.ts      — Access + Refresh JWT strategies
│   │                    local.strategy.ts    — Passport local (email/password)
│   ├── auth.service.ts                       — Login, register, refresh, logout, reset
│   ├── auth.controller.ts                   
│   └── auth.module.ts
│
├── users/
│   ├── dto/             users.dto.ts         — Zod schemas for user CRUD
│   ├── users.service.ts                      — Paginated CRUD, RBAC-aware
│   ├── users.controller.ts                  
│   └── users.module.ts
│
├── dashboard/
│   ├── dashboard.service.ts                  — Stats aggregation + activity feed
│   ├── dashboard.controller.ts               — Cached dashboard endpoints
│   └── dashboard.module.ts
│
├── common/
│   ├── filters/         all-exceptions.filter.ts    — Global error handler
│   ├── interceptors/    transform.interceptor.ts    — {success,data} wrapper
│   │                    logging.interceptor.ts      — Request/response logging
│   ├── guards/          index.ts                    — JWT + Roles + Permissions guards
│   ├── pipes/           zod-validation.pipe.ts      — Zod DTO validation
│   ├── decorators/      auth.decorators.ts          — @Public, @Roles, @RequirePermissions
│   │                    current-user.decorator.ts   — @CurrentUser, @CurrentUserId
│   └── logger/          logger.service.ts           — Winston logger
│
├── config/
│   ├── app.config.ts                         — Env validation (Zod) + config factories
│   └── roles.config.ts                       — ROLES, PERMISSIONS, ROLE_PERMISSIONS
│
├── prisma/
│   ├── prisma.service.ts                     — PrismaClient with lifecycle hooks
│   └── prisma.module.ts
│
├── health/              health.controller.ts — DB health check endpoint
├── app.module.ts                             — Root module, global providers
└── main.ts                                   — Bootstrap: Helmet, CORS, Swagger, cookies

prisma/
├── schema.prisma                             — Full DB schema

test/
├── auth.e2e-spec.ts                          — Full auth flow E2E tests
├── global-setup.ts / global-teardown.ts
└── jest-e2e.json
```

---

##   Quick Start

### 1. Install dependencies
```bash
npm install
```

### 2. Configure environment
```bash
cp .env.example .env
# Edit .env — set DATABASE_URL, JWT secrets, etc.
```

### 3. Set up database
```bash
# Run migrations
npm run db:migrate

# Seed demo users
npm run db:seed
```

### 4. Start dev server
```bash
npm run start:dev
# API: http://localhost:5000/api
# Swagger: http://localhost5000/api/docs
```

---

## 🔐 Authentication Flow

All auth endpoints live under `/api/auth/`:

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/auth/login` | Public | Login, sets HTTP-only cookies |
| `POST` | `/auth/register` | Public | Register, sets HTTP-only cookies |
| `POST` | `/auth/logout` | 🔒 | Revoke token, clear cookies |
| `POST` | `/auth/refresh` | Public | Rotate refresh token |
| `GET`  | `/auth/me` | 🔒 | Get current user |
| `POST` | `/auth/forgot-password` | Public | Send reset email |
| `POST` | `/auth/reset-password` | Public | Reset with token |
| `POST` | `/auth/change-password` | 🔒 | Change password (re-login required) |
| `POST` | `/auth/verify-email` | Public | Verify email token |

### Token strategy
- **Access token**: JWT, 1h expiry, attached via `Authorization: Bearer` header **and** `auth_token` HTTP-only cookie
- **Refresh token**: JWT, 7d expiry, stored in DB + `refresh_token` HTTP-only cookie
- **Rotation**: every refresh issues a new pair and revokes the old refresh token
- **Logout everywhere**: revokes all refresh tokens for the user

---

## 👥 Users API

| Method | Path | Permission | Description |
|--------|------|------------|-------------|
| `GET` | `/users` | `user:read` | Paginated user list |
| `GET` | `/users/:id` | `user:read` | Get user by ID |
| `POST` | `/users` | `user:create` | Create user (admin) |
| `PATCH` | `/users/:id` | `user:update` | Update user |
| `DELETE` | `/users/:id` | `user:delete` | Soft-delete user |
| `PATCH` | `/users/:id/preferences` | — | Update preferences |
 
---

## 📊 Dashboard API

| Method | Path | Permission | Description |
|--------|------|------------|-------------|
| `GET` | `/dashboard` | `dashboard:view` | Combined stats + activity (30s cache) |
| `GET` | `/dashboard/stats` | `dashboard:view` | Stats only (1min cache) |
| `GET` | `/dashboard/activity?limit=10` | `dashboard:view` | Activity feed |

---

##  RBAC — Role-Based Access Control

Roles: `superadmin > admin > user > viewer`

### Guard decorators
```ts
// Require roles
@Roles('admin', 'superadmin')

// Require permissions
@RequirePermissions('user:delete')

// Skip JWT auth entirely
@Public()
```

### Permission matrix

| Permission | superadmin | admin | user | viewer |
|---|:-:|:-:|:-:|:-:|
| `user:read` | ✅ | ✅ | ❌ | ❌ |
| `user:create` | ✅ | ✅ | ❌ | ❌ |
| `user:update` | ✅ | ✅ | ❌ | ❌ |
| `user:delete` | ✅ | ✅ | ❌ | ❌ |
| `dashboard:view` | ✅ | ✅ | ✅ | ✅ |
| `analytics:view` | ✅ | ✅ | ❌ | ❌ |
| `settings:view` | ✅ | ✅ | ✅ | ❌ |
| `billing:view` | ✅ | ✅ | ❌ | ❌ |

---

##    Response Format

Every response is wrapped by `TransformInterceptor`:
```json
{ "success": true, "data": <payload> }
```

Every error is handled by `AllExceptionsFilter`:
```json
{
  "success": false,
  "data": null,
  "code": "NOT_FOUND",
  "message": "User not found",
  "statusCode": 404,
  "details": [...]
}
```
This matches the frontend `ApiResponse<T>` and `ApiError` types exactly.

---

## 🧪 Testing

```bash
# Unit tests
npm test

# Unit tests with coverage
npm run test:cov

# Watch mode
npm run test:watch

# E2E tests (requires running test DB)
TEST_DATABASE_URL="postgresql://..." npm run test:e2e
```

### Test coverage targets: 70% across branches, functions, lines

Unit tests cover:
- `AuthService` — all methods: login, register, refresh, logout, forgotPassword, resetPassword, getMe
- `UsersService` — findAll, findById, create, update, delete, updatePreferences
- `DashboardService` — getStats (growth calculation), getRecentActivity, getDashboardData
- `AuthController` — cookie setting, delegation, response shape
- `ZodValidationPipe` — pass/fail cases, error format
- `AllExceptionsFilter` — HttpException, Prisma P2002/P2025, ZodError, unknown errors

---

##   Security Features

| Feature | Implementation |
|---|---|
| Password hashing | `bcryptjs` with configurable rounds (default: 12) |
| JWT signing | RS256-compatible secret, separate access/refresh secrets |
| HTTP-only cookies | `cookie-parser` + `httpOnly: true` on all auth cookies |
| CORS | Allowlist-based, `credentials: true` for cookies |
| Helmet | Security headers on all responses |
| Rate limiting | `@nestjs/throttler`: 100 req/min global, 10/min login, 5/min register |
| Input sanitization | Zod strips unknown fields, `toLowerCase()` on emails |
| SQL injection | Prisma parameterized queries — no raw SQL in business logic |
| RBAC | Guards on every protected route, decorator-driven |
| Token rotation | Refresh tokens rotated on every use |
| Soft delete | Users are deactivated, not hard-deleted (data integrity) |
| Email enumeration | `forgotPassword` returns success regardless of email existence |
