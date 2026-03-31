import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  Logger,
} from '@nestjs/common'
import { PrismaService } from '@/prisma/prisma.service'
import { getPermissionsForRole } from '@/config/roles.config'
import type { Role } from '@/config/roles.config'
import type {
  CreateUserDto,
  UpdateUserDto,
  UserFilterDto,
  UpdatePreferencesDto,
} from './dto/users.dto'
import type { SafeUser } from '@/auth/auth.service'
import { ActivityAction } from '@prisma/client'
import * as bcrypt from 'bcryptjs'
import { ConfigService } from '@nestjs/config'

// ─── Pagination response ──────────────────────────────────────────────────────
export interface PaginatedUsers {
  users: SafeUser[]
  meta: {
    page: number
    pageSize: number
    total: number
    totalPages: number
    hasNextPage: boolean
    hasPreviousPage: boolean
  }
}

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name)

  constructor(
    private prisma: PrismaService,
    private config: ConfigService
  ) { }

  // ─── List users (paginated) ───────────────────────────────────────────────

  async findAll(filter: UserFilterDto): Promise<PaginatedUsers> {
    const { page, pageSize, search, sortBy, sortOrder, role, isActive } = filter

    const where = {
      ...(search
        ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' as const } },
            { email: { contains: search, mode: 'insensitive' as const } },
          ],
        }
        : {}),
      ...(role !== undefined ? { role } : {}),
      ...(isActive !== undefined ? { isActive } : {}),
    }

    const orderBy = sortBy
      ? { [sortBy]: sortOrder }
      : { createdAt: sortOrder }

    const [users, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { preferences: true },
      }),
      this.prisma.user.count({ where }),
    ])

    const totalPages = Math.ceil(total / pageSize)

    return {
      users: users.map(u => this.toSafeUser(u)),
      meta: {
        page,
        pageSize,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    }
  }

  // ─── Get user by id ───────────────────────────────────────────────────────

  async findById(id: string): Promise<SafeUser> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { preferences: true },
    })

    if (!user) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'User not found' })
    }

    return this.toSafeUser(user)
  }

  // ─── Create user (admin action) ───────────────────────────────────────────

  async create(
    dto: CreateUserDto,
    actorId: string
  ): Promise<SafeUser> {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    })
    if (existing) {
      throw new ConflictException({
        code: 'EMAIL_ALREADY_EXISTS',
        message: 'A user with this email already exists',
      })
    }

    const bcryptRounds = this.config.get<number>('BCRYPT_ROUNDS') ?? 12
    const hashedPassword = await bcrypt.hash(dto.password, bcryptRounds)

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        name: dto.name,
        password: hashedPassword,
        role: dto.role,
        preferences: {
          create: {
            theme: 'system',
            language: 'en',
            emailNotifications: true,
            pushNotifications: true,
            inAppNotifications: true,
          },
        },
      },
      include: { preferences: true },
    })

    await this.logActivity(actorId, ActivityAction.USER_CREATED, {
      targetId: user.id,
      targetName: user.name,
    })

    return this.toSafeUser(user)
  }

  // ─── Update user ──────────────────────────────────────────────────────────

  async update(
    id: string,
    dto: UpdateUserDto,
    actorId: string,
    actorRole: Role
  ): Promise<SafeUser> {
    const target = await this.prisma.user.findUnique({ where: { id } })
    if (!target) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'User not found' })
    }

    // Non-admins can only update themselves
    if (actorId !== id && actorRole === 'user') {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'You can only update your own profile',
      })
    }

    // Only superadmin can modify other admins
    if (
      target.role === 'admin' &&
      actorRole !== 'superadmin' &&
      actorId !== id
    ) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Insufficient privileges to modify this user',
      })
    }

    // Check email uniqueness if changing email
    if (dto.email && dto.email !== target.email) {
      const emailExists = await this.prisma.user.findUnique({
        where: { email: dto.email },
      })
      if (emailExists) {
        throw new ConflictException({
          code: 'EMAIL_ALREADY_EXISTS',
          message: 'Email is already in use',
        })
      }
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.email !== undefined && { email: dto.email }),
        ...(dto.role !== undefined && { role: dto.role }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        ...(dto.avatar !== undefined && { avatar: dto.avatar }),
      },
      include: { preferences: true },
    })

    // Log role change separately
    if (dto.role && dto.role !== target.role) {
      await this.logActivity(actorId, ActivityAction.ROLE_CHANGED, {
        targetId: id,
        targetName: updated.name,
      })
    } else {
      await this.logActivity(actorId, ActivityAction.USER_UPDATED, {
        targetId: id,
        targetName: updated.name,
      })
    }

    return this.toSafeUser(updated)
  }

  // ─── Delete user ──────────────────────────────────────────────────────────

  async delete(id: string, actorId: string, actorRole: Role): Promise<void> {
    const target = await this.prisma.user.findUnique({ where: { id } })
    if (!target) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'User not found' })
    }

    if (id === actorId) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'You cannot delete your own account',
      })
    }

    // Only superadmin can delete admins
    if (target.role === 'admin' && actorRole !== 'superadmin') {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Insufficient privileges',
      })
    }

    // Soft delete — preserve data integrity
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id },
        data: { isActive: false, email: `deleted_${Date.now()}_${target.email}` },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId: id },
        data: { isRevoked: true },
      }),
    ])

    await this.logActivity(actorId, ActivityAction.USER_DELETED, {
      targetId: id,
      targetName: target.name,
    })
  }

  // ─── Update preferences ───────────────────────────────────────────────────

  async updatePreferences(
    userId: string,
    dto: UpdatePreferencesDto
  ): Promise<SafeUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { preferences: true },
    })

    if (!user) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'User not found' })
    }

    await this.prisma.userPreferences.upsert({
      where: { userId },
      create: {
        userId,
        theme: dto.theme ?? 'system',
        language: dto.language ?? 'en',
        emailNotifications: dto.emailNotifications ?? true,
        pushNotifications: dto.pushNotifications ?? true,
        inAppNotifications: dto.inAppNotifications ?? true,
      },
      update: {
        ...(dto.theme !== undefined && { theme: dto.theme }),
        ...(dto.language !== undefined && { language: dto.language }),
        ...(dto.emailNotifications !== undefined && {
          emailNotifications: dto.emailNotifications,
        }),
        ...(dto.pushNotifications !== undefined && {
          pushNotifications: dto.pushNotifications,
        }),
        ...(dto.inAppNotifications !== undefined && {
          inAppNotifications: dto.inAppNotifications,
        }),
      },
    })

    await this.logActivity(userId, ActivityAction.SETTINGS_UPDATED)

    return this.findById(userId)
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private toSafeUser(user: Record<string, unknown> & { role: string; preferences?: unknown }): SafeUser {
    const { password: _, ...safe } = user as unknown as { password: string } & Record<string, unknown>;
    return {
      ...safe,
      permissions: getPermissionsForRole(user.role as Role),
    } as SafeUser;
  }

  private async logActivity(
    userId: string,
    action: ActivityAction,
    meta: { targetId?: string; targetName?: string } = {}
  ) {
    try {
      await this.prisma.activityLog.create({
        data: { userId, action, ...meta },
      })
    } catch {
      this.logger.warn('Failed to log activity')
    }
  }
}
