import { Test, TestingModule } from '@nestjs/testing'
import {
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { UsersService } from '@/users/users.service'
import { PrismaService } from '@/prisma/prisma.service'
import * as bcrypt from 'bcryptjs'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const makeUser = (overrides = {}) => ({
  id: 'user-1',
  email: 'user@example.com',
  name: 'Test User',
  password: '$2a$12$hashed',
  role: 'user' as const,
  avatar: null,
  isEmailVerified: true,
  isActive: true,
  lastLoginAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  preferences: {
    id: 'pref-1',
    userId: 'user-1',
    theme: 'system',
    language: 'en',
    emailNotifications: true,
    pushNotifications: true,
    inAppNotifications: true,
  },
  ...overrides,
})

const prismaMock = {
  user: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
  userPreferences: {
    upsert: jest.fn(),
  },
  activityLog: {
    create: jest.fn(),
  },
  $transaction: jest.fn(),
}

const configMock = {
  get: jest.fn((key: string) => (key === 'BCRYPT_ROUNDS' ? 10 : undefined)),
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('UsersService', () => {
  let service: UsersService

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: ConfigService, useValue: configMock },
      ],
    }).compile()

    service = module.get<UsersService>(UsersService)
    jest.clearAllMocks()
  })

  // ─── findAll ──────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('returns paginated users', async () => {
      const users = [makeUser(), makeUser({ id: 'user-2', email: 'b@b.com' })]
      prismaMock.$transaction.mockResolvedValue([users, 2])

      const result = await service.findAll({
        page: 1,
        pageSize: 10,
        sortOrder: 'asc',
      })

      expect(result.users).toHaveLength(2)
      expect(result.meta.total).toBe(2)
      expect(result.meta.totalPages).toBe(1)
      expect(result.meta.hasNextPage).toBe(false)
    })

    it('strips passwords from all results', async () => {
      prismaMock.$transaction.mockResolvedValue([[makeUser()], 1])
      const result = await service.findAll({ page: 1, pageSize: 10, sortOrder: 'asc' })
      result.users.forEach(u => expect(u).not.toHaveProperty('password'))
    })

    it('calculates hasNextPage correctly', async () => {
      const users = Array.from({ length: 10 }, (_, i) => makeUser({ id: `u${i}` }))
      prismaMock.$transaction.mockResolvedValue([users, 25])

      const result = await service.findAll({ page: 1, pageSize: 10, sortOrder: 'asc' })

      expect(result.meta.hasNextPage).toBe(true)
      expect(result.meta.totalPages).toBe(3)
    })
  })

  // ─── findById ─────────────────────────────────────────────────────────────

  describe('findById', () => {
    it('returns user without password', async () => {
      prismaMock.user.findUnique.mockResolvedValue(makeUser())
      const result = await service.findById('user-1')
      expect(result).not.toHaveProperty('password')
      expect(result.id).toBe('user-1')
    })

    it('attaches permissions for role', async () => {
      prismaMock.user.findUnique.mockResolvedValue(makeUser({ role: 'admin' }))
      const result = await service.findById('user-1')
      expect(result.permissions).toContain('user:read')
      expect(result.permissions).toContain('analytics:view')
    })

    it('throws NotFoundException for unknown id', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null)
      await expect(service.findById('unknown')).rejects.toThrow(NotFoundException)
    })
  })

  // ─── create ───────────────────────────────────────────────────────────────

  describe('create', () => {
    const dto = {
      name: 'New User',
      email: 'new@example.com',
      password: 'Password@1',
      role: 'user' as const,
    }

    beforeEach(() => {
      prismaMock.user.findUnique.mockResolvedValue(null)
      jest.spyOn(bcrypt, 'hash').mockResolvedValue('$hashed' as never)
      prismaMock.user.create.mockResolvedValue(makeUser({ email: dto.email, name: dto.name }))
      prismaMock.activityLog.create.mockResolvedValue({})
    })

    it('creates and returns user without password', async () => {
      const result = await service.create(dto, 'actor-1')
      expect(result).not.toHaveProperty('password')
      expect(prismaMock.user.create).toHaveBeenCalled()
    })

    it('hashes password', async () => {
      await service.create(dto, 'actor-1')
      expect(bcrypt.hash).toHaveBeenCalledWith(dto.password, 10)
    })

    it('throws ConflictException for duplicate email', async () => {
      prismaMock.user.findUnique.mockResolvedValue(makeUser())
      await expect(service.create(dto, 'actor-1')).rejects.toThrow(ConflictException)
    })
  })

  // ─── update ───────────────────────────────────────────────────────────────

  describe('update', () => {
    it('allows admin to update any user', async () => {
      prismaMock.user.findUnique.mockResolvedValue(makeUser())
      prismaMock.user.update.mockResolvedValue(makeUser({ name: 'Updated' }))
      prismaMock.activityLog.create.mockResolvedValue({})

      const result = await service.update(
        'user-1',
        { name: 'Updated' },
        'admin-id',
        'admin'
      )
      expect(result.name).toBe('Updated')
    })

    it('throws ForbiddenException when user updates others', async () => {
      prismaMock.user.findUnique.mockResolvedValue(makeUser({ id: 'user-1' }))

      await expect(
        service.update('user-1', { name: 'Hacked' }, 'other-user', 'user')
      ).rejects.toThrow(ForbiddenException)
    })

    it('throws NotFoundException for unknown user', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null)
      await expect(
        service.update('unknown', {}, 'admin-id', 'admin')
      ).rejects.toThrow(NotFoundException)
    })

    it('throws ConflictException for duplicate email', async () => {
      const targetUser = makeUser({ id: 'user-1', email: 'old@old.com' })
      prismaMock.user.findUnique
        .mockResolvedValueOnce(targetUser)  // finding target
        .mockResolvedValueOnce(makeUser())  // email exists check

      await expect(
        service.update('user-1', { email: 'taken@example.com' }, 'admin-id', 'admin')
      ).rejects.toThrow(ConflictException)
    })
  })

  // ─── delete ───────────────────────────────────────────────────────────────

  describe('delete', () => {
    beforeEach(() => {
      prismaMock.$transaction.mockImplementation(async (ops: unknown[]) => {
        for (const op of ops) await op
      })
      prismaMock.user.update.mockResolvedValue({})
      prismaMock.user.updateMany.mockResolvedValue({ count: 0 })
      prismaMock.activityLog.create.mockResolvedValue({})
    })

    it('soft-deletes user', async () => {
      prismaMock.user.findUnique.mockResolvedValue(makeUser())

      await service.delete('user-1', 'admin-id', 'admin')

      expect(prismaMock.$transaction).toHaveBeenCalled()
    })

    it('throws ForbiddenException when deleting own account', async () => {
      prismaMock.user.findUnique.mockResolvedValue(makeUser({ id: 'actor-id' }))

      await expect(
        service.delete('actor-id', 'actor-id', 'admin')
      ).rejects.toThrow(ForbiddenException)
    })

    it('throws ForbiddenException when user tries to delete admin', async () => {
      prismaMock.user.findUnique.mockResolvedValue(makeUser({ role: 'admin' }))

      await expect(
        service.delete('admin-id', 'user-id', 'user')
      ).rejects.toThrow(ForbiddenException)
    })

    it('throws NotFoundException for unknown user', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null)
      await expect(service.delete('unknown', 'admin', 'admin')).rejects.toThrow(
        NotFoundException
      )
    })
  })

  // ─── updatePreferences ────────────────────────────────────────────────────

  describe('updatePreferences', () => {
    it('upserts preferences and returns updated user', async () => {
      prismaMock.user.findUnique
        .mockResolvedValueOnce(makeUser()) // initial check
        .mockResolvedValueOnce(makeUser({ preferences: { theme: 'dark' } })) // findById call

      prismaMock.userPreferences.upsert.mockResolvedValue({})
      prismaMock.activityLog.create.mockResolvedValue({})

      const result = await service.updatePreferences('user-1', { theme: 'dark' })
      expect(prismaMock.userPreferences.upsert).toHaveBeenCalled()
      expect(result).toBeDefined()
    })
  })
})
