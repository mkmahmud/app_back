import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common'
import { Observable } from 'rxjs'
import { tap } from 'rxjs/operators'
import { Request, Response } from 'express'
import { AppLogger } from '../logger/logger.service'

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  constructor(private logger: AppLogger) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const ctx = context.switchToHttp()
    const req = ctx.getRequest<Request>()
    const res = ctx.getResponse<Response>()
    const { method, url, ip } = req
    const requestId = req.headers['x-request-id'] as string
    const start = Date.now()

    return next.handle().pipe(
      tap({
        next: () => {
          const ms = Date.now() - start
          this.logger.log(
            `${method} ${url} ${res.statusCode} +${ms}ms`,
            `HTTP [${requestId ?? ip}]`
          )
        },
        error: err => {
          const ms = Date.now() - start
          this.logger.error(
            `${method} ${url} ${err.status ?? 500} +${ms}ms`,
            err.stack,
            `HTTP [${requestId ?? ip}]`
          )
        },
      })
    )
  }
}
