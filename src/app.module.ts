import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { ThrottlerModule } from '@nestjs/throttler'
import { CacheModule } from '@nestjs/cache-manager'
import { APP_GUARD, APP_INTERCEPTOR, APP_FILTER, Reflector } from '@nestjs/core'

import { validateEnv, appConfig, jwtConfig, authConfig, corsConfig } from './config/app.config'
import { PrismaModule } from './prisma/prisma.module'
import { AuthModule } from './auth/auth.module'
import { UsersModule } from './users/users.module'
import { DashboardModule } from './dashboard/dashboard.module'
import { HealthController } from './health/health.controller'

import { AllExceptionsFilter } from './common/filters/all-exceptions.filter'
import { TransformInterceptor } from './common/interceptors/transform.interceptor'
import { LoggingInterceptor } from './common/interceptors/logging.interceptor'
import { JwtAuthGuard } from './common/guards'
import { AppLogger } from './common/logger/logger.service'

@Module({
  imports: [
    // ── Config ────────────────────────────────────────────────────────────────
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
      load: [appConfig, jwtConfig, authConfig, corsConfig],
      cache: true,
    }),

    // ── Rate Limiting ─────────────────────────────────────────────────────────
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60_000,    // 1 minute window
        limit: 100,     // 100 requests per window globally
      },
    ]),

    // ── Response Caching ──────────────────────────────────────────────────────
    CacheModule.register({
      isGlobal: true,
      ttl: 60_000,   // 60 seconds default
      max: 100,      // max 100 cached items
    }),

    // ── Feature Modules ───────────────────────────────────────────────────────
    PrismaModule,
    AuthModule,
    UsersModule,
    DashboardModule,
  ],

  controllers: [HealthController],

  providers: [
    AppLogger,

    // Global exception filter
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },

    // Global JWT guard (use @Public() to skip)
    {
      provide: APP_GUARD,
      useFactory: (reflector: Reflector) => new JwtAuthGuard(reflector),
      inject: [Reflector],
    },

    // Global response transform → { success, data }
    {
      provide: APP_INTERCEPTOR,
      useFactory: (reflector: Reflector) => new TransformInterceptor(reflector),
      inject: [Reflector],
    },

    // Global request/response logger
    {
      provide: APP_INTERCEPTOR,
      useFactory: (logger: AppLogger) => new LoggingInterceptor(logger),
      inject: [AppLogger],
    },
  ],
})
export class AppModule {}
