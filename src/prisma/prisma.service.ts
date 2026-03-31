import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common'
import { PrismaClient } from '@prisma/client'

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name)

  constructor() {
    super({
      log:
        process.env.NODE_ENV === 'development'
          ? [
              { emit: 'event', level: 'query' },
              { emit: 'stdout', level: 'info' },
              { emit: 'stdout', level: 'warn' },
              { emit: 'stdout', level: 'error' },
            ]
          : [{ emit: 'stdout', level: 'error' }],
    })
  }

  async onModuleInit() {
    await this.$connect()
    this.logger.log('Database connected')

    // Log slow queries in development
    if (process.env.NODE_ENV === 'development') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(this.$on as any)('query', (e: { query: string; duration: number }) => {
        if (e.duration > 500) {
          this.logger.warn(`Slow query (${e.duration}ms): ${e.query}`)
        }
      })
    }
  }

  async onModuleDestroy() {
    await this.$disconnect()
    this.logger.log('Database disconnected')
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.$queryRaw`SELECT 1`
      return true
    } catch {
      return false
    }
  }

  /**
   * Soft-delete helper — sets isActive = false instead of DELETE
   */
  async softDelete(model: string, id: string) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (this as any)[model].update({
      where: { id },
      data: { isActive: false },
    })
  }
}
