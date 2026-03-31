import { Controller, Get } from '@nestjs/common'
import { ApiTags, ApiOperation } from '@nestjs/swagger'
import { PrismaService } from '@/prisma/prisma.service'
import { Public } from '@/common/decorators/auth.decorators'

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(private prisma: PrismaService) {}

  @Get()
  @Public()
  @ApiOperation({ summary: 'Health check' })
  async check() {
    const dbOk = await this.prisma.healthCheck()
    return {
      status: dbOk ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      services: {
        database: dbOk ? 'up' : 'down',
        api: 'up',
      },
      uptime: process.uptime(),
      version: process.env.npm_package_version ?? '0.1.0',
    }
  }
}
