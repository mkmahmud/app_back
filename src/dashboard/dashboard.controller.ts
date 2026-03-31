import { Controller, Get, Query, UseGuards, ParseIntPipe, DefaultValuePipe } from '@nestjs/common'
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger'
import { DashboardService } from './dashboard.service'
import { JwtAuthGuard, PermissionsGuard } from '@/common/guards'
import { RequirePermissions } from '@/common/decorators/auth.decorators'
import { CacheInterceptor, CacheTTL } from '@nestjs/cache-manager'
import { UseInterceptors } from '@nestjs/common'

@ApiTags('Dashboard')
@ApiBearerAuth()
@Controller('dashboard')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('dashboard:view')
export class DashboardController {
  constructor(private dashboardService: DashboardService) {}

  // ─── GET /dashboard ───────────────────────────────────────────────────────
  // Frontend: dashboardService.getDashboardData()

  @Get()
  @UseInterceptors(CacheInterceptor)
  @CacheTTL(30_000) // 30 second cache
  @ApiOperation({ summary: 'Get combined dashboard data (stats + activity)' })
  async getDashboardData() {
    return this.dashboardService.getDashboardData()
  }

  // ─── GET /dashboard/stats ─────────────────────────────────────────────────
  // Frontend: dashboardService.getStats()

  @Get('stats')
  @UseInterceptors(CacheInterceptor)
  @CacheTTL(60_000) // 1 minute cache
  @ApiOperation({ summary: 'Get dashboard statistics' })
  async getStats() {
    return this.dashboardService.getStats()
  }

  // ─── GET /dashboard/activity ──────────────────────────────────────────────
  // Frontend: dashboardService.getRecentActivity(limit)

  @Get('activity')
  @ApiOperation({ summary: 'Get recent activity feed' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getActivity(
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number
  ) {
    return this.dashboardService.getRecentActivity(limit)
  }
}
