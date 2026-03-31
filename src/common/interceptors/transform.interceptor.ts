import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common'
import { Observable } from 'rxjs'
import { map } from 'rxjs/operators'
import { Reflector } from '@nestjs/core'

export interface ApiResponse<T> {
  success: boolean
  data: T
  message?: string
  meta?: Record<string, unknown>
}

// Decorator to skip wrapping (e.g. file downloads)
export const SKIP_TRANSFORM = 'skipTransform'
@Injectable()
export class TransformInterceptor<T>
  implements NestInterceptor<T, ApiResponse<T>> {
  constructor(private reflector: Reflector) { }

  intercept(
    context: ExecutionContext,
    next: CallHandler
  ): Observable<ApiResponse<T>> {
    // 1. CHECK CONTEXT TYPE
    // If it's GraphQL, return the handler immediately without wrapping
    if (context.getType<string>() === 'graphql') {
      return next.handle();
    }

    // 2. CHECK SKIP DECORATOR (Your existing logic)
    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_TRANSFORM, [
      context.getHandler(),
      context.getClass(),
    ])
    if (skip) return next.handle()

    // 3. REST WRAPPING LOGIC
    return next.handle().pipe(
      map(data => {
        if (
          data &&
          typeof data === 'object' &&
          'success' in data &&
          'data' in data
        ) {
          return data
        }

        return {
          success: true,
          data: data ?? null,
        }
      })
    )
  }
}