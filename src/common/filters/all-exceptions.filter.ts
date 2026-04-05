import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common'
import { GqlArgumentsHost, GqlContextType } from '@nestjs/graphql'
import { GraphQLError } from 'graphql'
import { Request, Response } from 'express'
import { Prisma } from '@prisma/client'
import { ZodError } from 'zod'

interface ErrorResponse {
  success: false
  data: null
  code: string
  message: string
  statusCode: number
  details?: unknown
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name)

  catch(exception: unknown, host: ArgumentsHost) {
    // ── GraphQL context ───────────────────────────────────────────────────────
    if (host.getType<GqlContextType>() === 'graphql') {
      const gqlHost = GqlArgumentsHost.create(host)
      const errorResponse = this.buildErrorResponse(exception)

      this.logger.warn(
        `GraphQL Error → ${errorResponse.code}: ${errorResponse.message}`,
      )

      // Re-throw as a GraphQLError so Apollo formats it correctly
      throw new GraphQLError(errorResponse.message, {
        extensions: {
          code: errorResponse.code,
          statusCode: errorResponse.statusCode,
          details: errorResponse.details,
          success: false,
        },
      })
    }

    // ── REST / HTTP context ───────────────────────────────────────────────────
    const ctx = host.switchToHttp()
    const response = ctx.getResponse<Response>()
    const request = ctx.getRequest<Request>()

    const errorResponse = this.buildErrorResponse(exception)

    if (errorResponse.statusCode >= 500) {
      this.logger.error(
        `${request.method} ${request.url} → ${errorResponse.statusCode}`,
        exception instanceof Error ? exception.stack : String(exception),
      )
    } else {
      this.logger.warn(
        `${request.method} ${request.url} → ${errorResponse.statusCode}: ${errorResponse.message}`,
      )
    }

    response.status(errorResponse.statusCode).json(errorResponse)
  }

  private buildErrorResponse(exception: unknown): ErrorResponse {
    // ── NestJS HttpException ──────────────────────────────────────────────────
    if (exception instanceof HttpException) {
      const status = exception.getStatus()
      const exceptionResponse = exception.getResponse()

      let message = exception.message
      let code = this.statusToCode(status)
      let details: unknown

      if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        const resp = exceptionResponse as Record<string, unknown>
        message = (resp.message as string) || message
        code = (resp.code as string) || code
        if (Array.isArray(resp.message)) {
          details = resp.message
          message = 'Validation failed'
        }
      }

      return { success: false, data: null, code, message, statusCode: status, details }
    }

    // ── Prisma unique constraint violation ────────────────────────────────────
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') {
        const fields = (exception.meta?.target as string[])?.join(', ')
        return {
          success: false,
          data: null,
          code: 'CONFLICT',
          message: `A record with this ${fields ?? 'value'} already exists`,
          statusCode: HttpStatus.CONFLICT,
        }
      }
      if (exception.code === 'P2025') {
        return {
          success: false,
          data: null,
          code: 'NOT_FOUND',
          message: 'Record not found',
          statusCode: HttpStatus.NOT_FOUND,
        }
      }
      return {
        success: false,
        data: null,
        code: 'DATABASE_ERROR',
        message: 'A database error occurred',
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      }
    }

    // ── Zod validation error ──────────────────────────────────────────────────
    if (exception instanceof ZodError) {
      return {
        success: false,
        data: null,
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        statusCode: HttpStatus.BAD_REQUEST,
        details: exception.issues,
      }
    }

    // ── Unknown / Unhandled ───────────────────────────────────────────────────
    return {
      success: false,
      data: null,
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected error occurred',
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
    }
  }

  private statusToCode(status: number): string {
    const map: Record<number, string> = {
      400: 'BAD_REQUEST',
      401: 'UNAUTHORIZED',
      403: 'FORBIDDEN',
      404: 'NOT_FOUND',
      409: 'CONFLICT',
      422: 'UNPROCESSABLE_ENTITY',
      429: 'TOO_MANY_REQUESTS',
      500: 'INTERNAL_SERVER_ERROR',
    }
    return map[status] ?? 'HTTP_ERROR'
  }
}
