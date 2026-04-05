import { NestFactory, Reflector } from '@nestjs/core'
import { NestExpressApplication } from '@nestjs/platform-express'
import { ConfigService } from '@nestjs/config'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import { Logger } from '@nestjs/common'
import * as cookieParser from 'cookie-parser'
import * as compression from 'compression'
import helmet from 'helmet'

import { AppModule } from './app.module'
import { AppLogger } from './common/logger/logger.service'
import { validateEnv } from './config/app.config'

async function bootstrap() {

  console.log('DEBUG: Entered bootstrap function')
  validateEnv(process.env as Record<string, unknown>)

  console.log('DEBUG: Before AppModule creation')
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  })

  const config = app.get(ConfigService)
  const logger = new Logger('Bootstrap')
  const isDev = config.get<string>('NODE_ENV') !== 'production'
  const port = config.get<number>('PORT') ?? 5000

  console.log('DEBUG: Before Log configuration')
  // ── Logger ────────────────────────────────────────────────────────────────
  app.useLogger(app.get(AppLogger))

  // ── Security headers (Helmet) ─────────────────────────────────────────────
  // KEY FIX: Apollo Server v4 (used by @nestjs/apollo v12) loads its landing
  // page from cdn.apollographql.com. The old playground also needed jsdelivr.
  // We disable CSP in dev entirely so GraphQL tooling works without friction.
  console.log('DEBUG: Before helmet configuration')
  app.use(
    helmet({
      crossOriginEmbedderPolicy: false,
      contentSecurityPolicy: isDev
        ? false  // ← disabling CSP in dev is the simplest fix; nothing is blocked
        : {
          directives: {
            defaultSrc: [`'self'`],
            styleSrc: [`'self'`, `'unsafe-inline'`],
            fontSrc: [`'self'`],
            imgSrc: [`'self'`, 'data:'],
            scriptSrc: [`'self'`],
            connectSrc: [`'self'`],
          },
        },
    }),
  )

  // ── CORS ──────────────────────────────────────────────────────────────────
  const allowedOrigins = (config.get<string>('CORS_ORIGINS') ?? 'http://localhost:3000')
    .split(',')
    .map(o => o.trim())

  app.enableCors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true)
      } else {
        callback(new Error(`Origin ${origin} not allowed by CORS`))
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Request-ID',
      'X-Refresh-Token',
    ],
    exposedHeaders: ['X-Total-Count'],
  })

  console.log('DEBUG: cookie configuration')
  // ── Cookie parser ─────────────────────────────────────────────────────────
  app.use(cookieParser(config.get<string>('COOKIE_SECRET')))

  console.log('DEBUG: compression configuration')
  // ── Compression ───────────────────────────────────────────────────────────
  app.use(compression())

  console.log('DEBUG: trust proxy configuration')
  // ── Trust proxy ───────────────────────────────────────────────────────────
  app.set('trust proxy', 1)

  console.log('DEBUG: global prefix configuration')

  // ── Global API prefix (REST only — GraphQL is at /graphql, not /api/v1) ──
  // KEY FIX: exclude 'graphql' from the prefix so Apollo doesn't get
  // double-prefixed to /api/v1/graphql and stop responding.
  app.setGlobalPrefix('api/v1', { exclude: ['health', 'graphql'] })

  console.log('DEBUG: swagger configuration')
  // ── Swagger (dev only) ────────────────────────────────────────────────────
  if (isDev) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('SaaS API')
      .setDescription('Production-ready NestJS API')
      .setVersion('1.0')
      .addBearerAuth()
      .addCookieAuth('auth_token')
      .addServer(`http://localhost:${port}`)
      .build()

    const document = SwaggerModule.createDocument(app, swaggerConfig)
    SwaggerModule.setup('api/docs', app, document, {
      swaggerOptions: {
        persistAuthorization: true,
        tagsSorter: 'alpha',
        operationsSorter: 'alpha',
      },
    })
    logger.log(`Swagger docs → http://localhost:${port}/api/docs`)
  }

  // ── Graceful shutdown ─────────────────────────────────────────────────────
  app.enableShutdownHooks()
  console.log('DEBUG: before listening on port')

  try {
    await app.listen(port)
    console.log('DEBUG: after listening on port')
  } catch (err) {
    console.error('ERROR: app.listen failed', err)
  }
  console.log('DEBUG: after listening on port')

  logger.log(`REST API  → http://localhost:${port}/api/v1`)
  logger.log(`GraphQL   → http://localhost:${port}/graphql`)
  logger.log(`Env       → ${config.get('NODE_ENV')}`)
}

bootstrap().catch(err => {
  new Logger('Bootstrap').error('Failed to start application', err.stack)
  process.exit(1)
})



