import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { ThrottlerModule } from '@nestjs/throttler'
import { CacheModule } from '@nestjs/cache-manager'
import { APP_GUARD, APP_INTERCEPTOR, APP_FILTER, Reflector } from '@nestjs/core'
import { GraphQLModule } from '@nestjs/graphql'
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo'
import { Request } from 'express'

import { validateEnv, appConfig, jwtConfig, authConfig, corsConfig } from './config/app.config'
import { PrismaModule } from './prisma/prisma.module'
import { AuthModule } from './auth/auth.module'
import { UsersModule } from './users/users.module'
import { DashboardModule } from './dashboard/dashboard.module'
import { PostModule } from './post/post.module'
import { HealthController } from './health/health.controller'

import { AllExceptionsFilter } from './common/filters/all-exceptions.filter'
import { TransformInterceptor } from './common/interceptors/transform.interceptor'
import { LoggingInterceptor } from './common/interceptors/logging.interceptor'
import { JwtAuthGuard } from './common/guards'
import { AppLogger } from './common/logger/logger.service'
import { AppResolver } from './app.resolver'

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
        ttl: 60_000,
        limit: 100,
      },
    ]),

    // ── Response Caching ──────────────────────────────────────────────────────
    CacheModule.register({
      isGlobal: true,
      ttl: 60_000,
      max: 100,
    }),

    // ── GraphQL ───────────────────────────────────────────────────────────────
    // CRITICAL: Pass the Express `req` object into the GQL context so that
    // JwtAccessStrategy (cookie extractor) and CurrentUser decorator work.
    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      autoSchemaFile: 'schema.gql',
      path: '/graphql',
      playground: true,
      debug: true,
      introspection: true,
      context: ({ req }: { req: Request }) => ({ req }),
    }),

    // ── Feature Modules ───────────────────────────────────────────────────────
    PrismaModule,
    AuthModule,
    UsersModule,
    DashboardModule,
    PostModule,
  ],

  controllers: [HealthController],

  providers: [
    AppResolver,
    AppLogger,

    // Global exception filter — handles both REST & GQL
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },

    // Global JWT guard — handles both REST & GQL (use @Public() to skip)
    {
      provide: APP_GUARD,
      useFactory: (reflector: Reflector) => new JwtAuthGuard(reflector),
      inject: [Reflector],
    },

    // Global response transform → { success, data } for REST only
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
