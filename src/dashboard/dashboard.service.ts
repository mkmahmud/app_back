import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '@/prisma/prisma.service'
import { subDays, subMonths, startOfMonth, endOfMonth } from 'date-fns'

// ─── Types (match frontend DashboardStats + ActivityItem exactly) ─────────────

export interface DashboardStats {
  totalUsers: number
  activeUsers: number
  revenue: number        // placeholder – real billing integration TBD
  growth: number         // % growth in users vs previous month
}

export interface ActivityItem {
  id: string
  user: { id: string; name: string; avatar: string | null }
  action: string
  target?: string
  timestamp: string
}

export interface DashboardData {
  stats: DashboardStats
  recentActivity: ActivityItem[]
}

// Map Prisma ActivityAction enum → human-readable string
const ACTION_LABELS: Record<string, string> = {
  USER_CREATED: 'created user',
  USER_UPDATED: 'updated user',
  USER_DELETED: 'deleted user',
  USER_LOGIN: 'signed in',
  USER_LOGOUT: 'signed out',
  PASSWORD_CHANGED: 'changed password',
  PASSWORD_RESET_REQUESTED: 'requested password reset',
  EMAIL_VERIFIED: 'verified email',
  SETTINGS_UPDATED: 'updated settings',
  ROLE_CHANGED: 'changed role of',
}

@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name)

  constructor(private prisma: PrismaService) {}

  // ─── GET /dashboard/stats ─────────────────────────────────────────────────

  async getStats(): Promise<DashboardStats> {
    const now = new Date()
    const thisMonthStart = startOfMonth(now)
    const thisMonthEnd = endOfMonth(now)
    const lastMonthStart = startOfMonth(subMonths(now, 1))
    const lastMonthEnd = endOfMonth(subMonths(now, 1))

    const [totalUsers, activeUsers, thisMonthUsers, lastMonthUsers] =
      await this.prisma.$transaction([
        // Total registered users
        this.prisma.user.count(),
        // Active users (logged in within last 30 days)
        this.prisma.user.count({
          where: {
            isActive: true,
            lastLoginAt: { gte: subDays(now, 30) },
          },
        }),
        // New users this month
        this.prisma.user.count({
          where: {
            createdAt: { gte: thisMonthStart, lte: thisMonthEnd },
          },
        }),
        // New users last month
        this.prisma.user.count({
          where: {
            createdAt: { gte: lastMonthStart, lte: lastMonthEnd },
          },
        }),
      ])

    // Calculate growth % (avoid division by zero)
    const growth =
      lastMonthUsers === 0
        ? thisMonthUsers > 0
          ? 100
          : 0
        : Math.round(((thisMonthUsers - lastMonthUsers) / lastMonthUsers) * 100)

    return {
      totalUsers,
      activeUsers,
      revenue: 0,   // TODO: integrate billing service
      growth,
    }
  }

  // ─── GET /dashboard/activity ──────────────────────────────────────────────

  async getRecentActivity(limit = 10): Promise<ActivityItem[]> {
    const logs = await this.prisma.activityLog.findMany({
      take: Math.min(limit, 50),
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, name: true, avatar: true } },
        target: { select: { id: true, name: true } },
      },
    })

    return logs.map(log => ({
      id: log.id,
      user: {
        id: log.user.id,
        name: log.user.name,
        avatar: log.user.avatar,
      },
      action: ACTION_LABELS[log.action] ?? log.action.toLowerCase(),
      target: log.targetName ?? log.target?.name,
      timestamp: log.createdAt.toISOString(),
    }))
  }

  // ─── GET /dashboard ───────────────────────────────────────────────────────
  // Combined endpoint — avoids two round-trips from the frontend

  async getDashboardData(): Promise<DashboardData> {
    const [stats, recentActivity] = await Promise.all([
      this.getStats(),
      this.getRecentActivity(8),
    ])
    return { stats, recentActivity }
  }
}
