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
  // Validate env before anything starts
  validateEnv(process.env as Record<string, unknown>)

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  })

  const config = app.get(ConfigService)
  const logger = new Logger('Bootstrap')
  const isDev = config.get<string>('NODE_ENV') !== 'production'
  const port = config.get<number>('PORT') ?? 8000

  // ── Logger ────────────────────────────────────────────────────────────────
  app.useLogger(app.get(AppLogger))

  // ── Security headers (Helmet) ─────────────────────────────────────────────
  app.use(
    helmet({
      contentSecurityPolicy: isDev ? false : undefined,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    })
  )

  // ── CORS ──────────────────────────────────────────────────────────────────
  const allowedOrigins = (config.get<string>('CORS_ORIGINS') ?? 'http://localhost:3000')
    .split(',')
    .map(o => o.trim())

  app.enableCors({
    origin: (origin, callback) => {
      // Allow requests with no origin (server-to-server, Postman)
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true)
      } else {
        callback(new Error(`Origin ${origin} not allowed by CORS`))
      }
    },
    credentials: true, // Required for HTTP-only cookies
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Request-ID',
      'X-Refresh-Token',
    ],
    exposedHeaders: ['X-Total-Count'],
  })

  // ── Cookie parser ─────────────────────────────────────────────────────────
  app.use(cookieParser(config.get<string>('COOKIE_SECRET')))

  // ── Compression ───────────────────────────────────────────────────────────
  app.use(compression())

  // ── Trust proxy (for real IP behind load balancer) ────────────────────────
  app.set('trust proxy', 1)

  // ── Global API prefix ─────────────────────────────────────────────────────
  app.setGlobalPrefix('api/v1', { exclude: ['health'] })

  // ── Swagger (dev only) ────────────────────────────────────────────────────
  if (isDev) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('SaaS API')
      .setDescription(
        'Production-ready NestJS API matching the SaaS Next.js boilerplate'
      )
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
    logger.log(`Swagger docs available at http://localhost:${port}/api/docs`)
  }

  // ── Graceful shutdown ─────────────────────────────────────────────────────
  app.enableShutdownHooks()

  await app.listen(port)

  logger.log(`  Server running on http://localhost:${port}/api/v1`)
  logger.log(`  Environment: ${config.get('NODE_ENV')}`)
}

bootstrap().catch(err => {
  new Logger('Bootstrap').error('Failed to start application', err.stack)
  process.exit(1)
})
