import { z } from 'zod'

// ─── Pagination & Filter ──────────────────────────────────────────────────────
export const PaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  search: z.string().trim().optional(),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
})

export type PaginationDto = z.infer<typeof PaginationSchema>

export const UserFilterSchema = PaginationSchema.extend({
  role: z.enum(['superadmin', 'admin', 'user', 'viewer']).optional(),
  isActive: z.coerce.boolean().optional(),
})

export type UserFilterDto = z.infer<typeof UserFilterSchema>

// ─── Create User (admin) ──────────────────────────────────────────────────────
export const CreateUserSchema = z.object({
  name: z
    .string({ required_error: 'Name is required' })
    .min(2, 'Name must be at least 2 characters')
    .max(50)
    .trim(),
  email: z
    .string({ required_error: 'Email is required' })
    .email('Invalid email address')
    .toLowerCase()
    .trim(),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Must contain uppercase')
    .regex(/[a-z]/, 'Must contain lowercase')
    .regex(/\d/, 'Must contain number'),
  role: z.enum(['admin', 'user', 'viewer']).default('user'),
})

export type CreateUserDto = z.infer<typeof CreateUserSchema>

// ─── Update User ──────────────────────────────────────────────────────────────
export const UpdateUserSchema = z.object({
  name: z.string().min(2).max(50).trim().optional(),
  email: z.string().email().toLowerCase().trim().optional(),
  role: z.enum(['admin', 'user', 'viewer']).optional(),
  isActive: z.boolean().optional(),
  avatar: z.string().url().optional().nullable(),
})

export type UpdateUserDto = z.infer<typeof UpdateUserSchema>

// ─── Update Preferences ───────────────────────────────────────────────────────
export const UpdatePreferencesSchema = z.object({
  theme: z.enum(['light', 'dark', 'system']).optional(),
  language: z.string().min(2).max(5).optional(),
  emailNotifications: z.boolean().optional(),
  pushNotifications: z.boolean().optional(),
  inAppNotifications: z.boolean().optional(),
})

export type UpdatePreferencesDto = z.infer<typeof UpdatePreferencesSchema>

// ─── User ID param ────────────────────────────────────────────────────────────
export const UserIdSchema = z.object({
  id: z.string().uuid('Invalid user ID format'),
})

export type UserIdDto = z.infer<typeof UserIdSchema>
