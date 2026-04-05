import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common'
import { Observable } from 'rxjs'
import { tap } from 'rxjs/operators'
import { GqlContextType } from '@nestjs/graphql'
import { Request, Response } from 'express'
import { AppLogger } from '../logger/logger.service'

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  constructor(private logger: AppLogger) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    // ── GraphQL: log resolver name, not HTTP path ────────────────────────────
    if (context.getType<GqlContextType>() === 'graphql') {
      const resolverName = context.getHandler().name
      const className = context.getClass().name
      const start = Date.now()

      return next.handle().pipe(
        tap({
          next: () => {
            this.logger.log(
              `GQL ${className}.${resolverName} +${Date.now() - start}ms`,
              'GraphQL',
            )
          },
          error: (err: Error & { status?: number }) => {
            this.logger.error(
              `GQL ${className}.${resolverName} ERROR +${Date.now() - start}ms`,
              err.stack,
              'GraphQL',
            )
          },
        }),
      )
    }

    // ── REST ─────────────────────────────────────────────────────────────────
    const ctx = context.switchToHttp()
    const req = ctx.getRequest<Request>()
    const res = ctx.getResponse<Response>()
    const { method, url, ip } = req
    const requestId = req.headers['x-request-id'] as string
    const start = Date.now()

    return next.handle().pipe(
      tap({
        next: () => {
          this.logger.log(
            `${method} ${url} ${res.statusCode} +${Date.now() - start}ms`,
            `HTTP [${requestId ?? ip}]`,
          )
        },
        error: (err: Error & { status?: number }) => {
          this.logger.error(
            `${method} ${url} ${err.status ?? 500} +${Date.now() - start}ms`,
            err.stack,
            `HTTP [${requestId ?? ip}]`,
          )
        },
      }),
    )
  }
}
