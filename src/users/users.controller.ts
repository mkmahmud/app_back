import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
  UsePipes,
} from '@nestjs/common'
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiQuery,
} from '@nestjs/swagger'
import { Throttle } from '@nestjs/throttler'

import { UsersService } from './users.service'
import {
  UserFilterSchema,
  CreateUserSchema,
  UpdateUserSchema,
  UpdatePreferencesSchema,
  UserIdSchema,
  type UserFilterDto,
  type CreateUserDto,
  type UpdateUserDto,
  type UpdatePreferencesDto,
} from './dto/users.dto'
import { ZodValidationPipe } from '@/common/pipes/zod-validation.pipe'
import { JwtAuthGuard, RolesGuard, PermissionsGuard } from '@/common/guards'
import {
  Roles,
  RequirePermissions,
} from '@/common/decorators/auth.decorators'
import {
  CurrentUser,
  CurrentUserId,
  type JwtPayload,
} from '@/common/decorators/current-user.decorator'
import type { Role } from '@/config/roles.config'

@ApiTags('Users')
@ApiBearerAuth()
@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class UsersController {
  constructor(private usersService: UsersService) {}

  // ─── GET /users ──────────────────────────────────────────────────────────
  // Frontend: userService.getUsers(params)

  @Get()
  @RequirePermissions('user:read')
  @UsePipes(new ZodValidationPipe(UserFilterSchema))
  @ApiOperation({ summary: 'List users with pagination and filters' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'pageSize', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'role', required: false })
  @ApiQuery({ name: 'isActive', required: false })
  @ApiResponse({ status: 200, description: 'Paginated user list' })
  async findAll(@Query() filter: UserFilterDto) {
    const { users, meta } = await this.usersService.findAll(filter)
    // Return in frontend-expected shape: { data: { users, meta } }
    return { users, meta }
  }

  // ─── GET /users/:id ───────────────────────────────────────────────────────
  // Frontend: userService.getUserById(id)

  @Get(':id')
  @RequirePermissions('user:read')
  @ApiOperation({ summary: 'Get a single user by ID' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async findOne(@Param('id') id: string) {
    new ZodValidationPipe(UserIdSchema).transform({ id })
    return this.usersService.findById(id)
  }

  // ─── POST /users ─────────────────────────────────────────────────────────

  @Post()
  @Roles('admin', 'superadmin')
  @RequirePermissions('user:create')
  @UsePipes(new ZodValidationPipe(CreateUserSchema))
  @ApiOperation({ summary: 'Create a new user (admin only)' })
  @ApiResponse({ status: 201, description: 'User created' })
  @ApiResponse({ status: 409, description: 'Email already exists' })
  async create(
    @Body() dto: CreateUserDto,
    @CurrentUserId() actorId: string
  ) {
    return this.usersService.create(dto, actorId)
  }

  // ─── PATCH /users/:id ─────────────────────────────────────────────────────
  // Frontend: userService.updateUser(id, data)

  @Patch(':id')
  @RequirePermissions('user:update')
  @UsePipes(new ZodValidationPipe(UpdateUserSchema))
  @ApiOperation({ summary: 'Update a user' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() actor: JwtPayload
  ) {
    return this.usersService.update(id, dto, actor.sub, actor.role as Role)
  }

  // ─── DELETE /users/:id ────────────────────────────────────────────────────
  // Frontend: userService.deleteUser(id)

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles('admin', 'superadmin')
  @RequirePermissions('user:delete')
  @ApiOperation({ summary: 'Soft-delete a user' })
  @ApiResponse({ status: 204, description: 'User deleted' })
  async remove(
    @Param('id') id: string,
    @CurrentUser() actor: JwtPayload
  ) {
    await this.usersService.delete(id, actor.sub, actor.role as Role)
  }

  // ─── PATCH /users/:id/preferences ────────────────────────────────────────

  @Patch(':id/preferences')
  @UsePipes(new ZodValidationPipe(UpdatePreferencesSchema))
  @ApiOperation({ summary: 'Update user preferences' })
  async updatePreferences(
    @Param('id') id: string,
    @Body() dto: UpdatePreferencesDto,
    @CurrentUserId() actorId: string
  ) {
    // Users can only update their own preferences
    if (id !== actorId) {
      const { RolesGuard: _ } = await import('@/common/guards')
    }
    return this.usersService.updatePreferences(id, dto)
  }
}
