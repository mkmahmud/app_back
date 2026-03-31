import { z } from 'zod'

// ─── Shared password schema ───────────────────────────────────────────────────
const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/\d/, 'Password must contain at least one number')

// ─── Login ────────────────────────────────────────────────────────────────────
export const LoginSchema = z.object({
  email: z
    .string({ required_error: 'Email is required' })
    .email('Invalid email address')
    .toLowerCase()
    .trim(),
  password: z.string({ required_error: 'Password is required' }).min(1, 'Password is required'),
  rememberMe: z.boolean().optional().default(false),
})

export type LoginDto = z.infer<typeof LoginSchema>

// ─── Register ─────────────────────────────────────────────────────────────────
export const RegisterSchema = z
  .object({
    name: z
      .string({ required_error: 'Name is required' })
      .min(2, 'Name must be at least 2 characters')
      .max(50, 'Name must be at most 50 characters')
      .trim(),
    email: z
      .string({ required_error: 'Email is required' })
      .email('Invalid email address')
      .toLowerCase()
      .trim(),
    password: passwordSchema,
    confirmPassword: z.string({ required_error: 'Please confirm your password' }),
  })
  .refine(data => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })

export type RegisterDto = z.infer<typeof RegisterSchema>

// ─── Forgot Password ──────────────────────────────────────────────────────────
export const ForgotPasswordSchema = z.object({
  email: z
    .string({ required_error: 'Email is required' })
    .email('Invalid email address')
    .toLowerCase()
    .trim(),
})

export type ForgotPasswordDto = z.infer<typeof ForgotPasswordSchema>

// ─── Reset Password ───────────────────────────────────────────────────────────
export const ResetPasswordSchema = z
  .object({
    token: z.string({ required_error: 'Token is required' }).min(1),
    password: passwordSchema,
    confirmPassword: z.string({ required_error: 'Please confirm your password' }),
  })
  .refine(data => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })

export type ResetPasswordDto = z.infer<typeof ResetPasswordSchema>

// ─── Verify Email ─────────────────────────────────────────────────────────────
export const VerifyEmailSchema = z.object({
  token: z.string({ required_error: 'Token is required' }).min(1),
})

export type VerifyEmailDto = z.infer<typeof VerifyEmailSchema>

// ─── Refresh Token ────────────────────────────────────────────────────────────
export const RefreshTokenSchema = z.object({
  refreshToken: z.string({ required_error: 'Refresh token is required' }).min(1),
})

export type RefreshTokenDto = z.infer<typeof RefreshTokenSchema>

// ─── Change Password ──────────────────────────────────────────────────────────
export const ChangePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: passwordSchema,
    confirmPassword: z.string().min(1, 'Please confirm your new password'),
  })
  .refine(data => data.newPassword === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })
  .refine(data => data.currentPassword !== data.newPassword, {
    message: 'New password must differ from current password',
    path: ['newPassword'],
  })

export type ChangePasswordDto = z.infer<typeof ChangePasswordSchema>
