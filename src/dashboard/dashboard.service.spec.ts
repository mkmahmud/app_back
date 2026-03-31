import { Test, TestingModule } from '@nestjs/testing'
import { DashboardService } from '@/dashboard/dashboard.service'
import { PrismaService } from '@/prisma/prisma.service'
import { subDays } from 'date-fns'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const makeActivityLog = (overrides = {}) => ({
  id: 'log-1',
  userId: 'user-1',
  targetId: null,
  action: 'USER_LOGIN',
  targetName: null,
  metadata: null,
  ipAddress: '127.0.0.1',
  userAgent: 'jest',
  createdAt: new Date(),
  user: { id: 'user-1', name: 'Alice', avatar: null },
  target: null,
  ...overrides,
})

const prismaMock = {
  user: {
    count: jest.fn(),
  },
  activityLog: {
    findMany: jest.fn(),
  },
  $transaction: jest.fn(),
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('DashboardService', () => {
  let service: DashboardService

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DashboardService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile()

    service = module.get<DashboardService>(DashboardService)
    jest.clearAllMocks()
  })

  // ─── getStats ────────────────────────────────────────────────────────────

  describe('getStats', () => {
    it('returns correct stats shape', async () => {
      // [totalUsers, activeUsers, thisMonthUsers, lastMonthUsers]
      prismaMock.$transaction.mockResolvedValue([150, 42, 15, 10])

      const result = await service.getStats()

      expect(result).toEqual({
        totalUsers: 150,
        activeUsers: 42,
        revenue: 0,
        growth: expect.any(Number),
      })
    })

    it('calculates positive growth correctly', async () => {
      prismaMock.$transaction.mockResolvedValue([100, 30, 20, 10])
      const result = await service.getStats()
      expect(result.growth).toBe(100) // (20-10)/10 * 100 = 100%
    })

    it('calculates negative growth correctly', async () => {
      prismaMock.$transaction.mockResolvedValue([100, 30, 5, 10])
      const result = await service.getStats()
      expect(result.growth).toBe(-50) // (5-10)/10 * 100 = -50%
    })

    it('handles zero last-month users (no division by zero)', async () => {
      prismaMock.$transaction.mockResolvedValue([10, 5, 10, 0])
      const result = await service.getStats()
      expect(result.growth).toBe(100) // special case: 100% when starting from 0
    })

    it('returns 0 growth when both months are 0', async () => {
      prismaMock.$transaction.mockResolvedValue([0, 0, 0, 0])
      const result = await service.getStats()
      expect(result.growth).toBe(0)
    })
  })

  // ─── getRecentActivity ────────────────────────────────────────────────────

  describe('getRecentActivity', () => {
    it('returns activity items in frontend ActivityItem shape', async () => {
      prismaMock.activityLog.findMany.mockResolvedValue([makeActivityLog()])

      const result = await service.getRecentActivity(10)

      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject({
        id: 'log-1',
        user: { id: 'user-1', name: 'Alice', avatar: null },
        action: 'signed in',
        timestamp: expect.any(String),
      })
    })

    it('maps action enum to human-readable label', async () => {
      prismaMock.activityLog.findMany.mockResolvedValue([
        makeActivityLog({ action: 'USER_CREATED', targetName: 'Bob' }),
      ])

      const [item] = await service.getRecentActivity(5)
      expect(item.action).toBe('created user')
      expect(item.target).toBe('Bob')
    })

    it('caps limit at 50', async () => {
      prismaMock.activityLog.findMany.mockResolvedValue([])
      await service.getRecentActivity(999)

      expect(prismaMock.activityLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 50 })
      )
    })

    it('returns empty array when no activity', async () => {
      prismaMock.activityLog.findMany.mockResolvedValue([])
      const result = await service.getRecentActivity()
      expect(result).toEqual([])
    })

    it('returns ISO timestamp strings', async () => {
      prismaMock.activityLog.findMany.mockResolvedValue([makeActivityLog()])
      const [item] = await service.getRecentActivity()
      expect(() => new Date(item.timestamp)).not.toThrow()
      expect(item.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    })
  })

  // ─── getDashboardData ─────────────────────────────────────────────────────

  describe('getDashboardData', () => {
    it('returns combined stats and activity', async () => {
      prismaMock.$transaction.mockResolvedValue([100, 40, 10, 8])
      prismaMock.activityLog.findMany.mockResolvedValue([makeActivityLog()])

      const result = await service.getDashboardData()

      expect(result).toHaveProperty('stats')
      expect(result).toHaveProperty('recentActivity')
      expect(result.stats.totalUsers).toBe(100)
      expect(result.recentActivity).toHaveLength(1)
    })

    it('fetches both stats and activity in parallel', async () => {
      prismaMock.$transaction.mockResolvedValue([0, 0, 0, 0])
      prismaMock.activityLog.findMany.mockResolvedValue([])

      await service.getDashboardData()

      expect(prismaMock.$transaction).toHaveBeenCalledTimes(1)
      expect(prismaMock.activityLog.findMany).toHaveBeenCalledTimes(1)
    })
  })
})
