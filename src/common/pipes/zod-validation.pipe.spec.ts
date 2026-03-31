import { BadRequestException } from '@nestjs/common'
import { ZodValidationPipe } from '@/common/pipes/zod-validation.pipe'
import { LoginSchema, RegisterSchema } from '@/auth/dto/auth.dto'
import { z } from 'zod'

describe('ZodValidationPipe', () => {
  // ─── Basic schema ─────────────────────────────────────────────────────────

  describe('with simple schema', () => {
    const schema = z.object({
      name: z.string().min(2),
      age: z.number().min(0),
    })

    let pipe: ZodValidationPipe

    beforeEach(() => {
      pipe = new ZodValidationPipe(schema)
    })

    it('passes valid data through unchanged', () => {
      const input = { name: 'Alice', age: 25 }
      const result = pipe.transform(input)
      expect(result).toEqual(input)
    })

    it('throws BadRequestException for missing field', () => {
      expect(() => pipe.transform({ name: 'Alice' })).toThrow(BadRequestException)
    })

    it('throws BadRequestException for wrong type', () => {
      expect(() => pipe.transform({ name: 'Alice', age: 'twenty' })).toThrow(
        BadRequestException
      )
    })

    it('throws with code VALIDATION_ERROR', () => {
      try {
        pipe.transform({ name: 'A' })
      } catch (e) {
        expect(e).toBeInstanceOf(BadRequestException)
        const resp = (e as BadRequestException).getResponse() as Record<string, unknown>
        expect(resp.code).toBe('VALIDATION_ERROR')
      }
    })

    it('includes field-level error details', () => {
      try {
        pipe.transform({ name: 'A', age: -1 })
      } catch (e) {
        const resp = (e as BadRequestException).getResponse() as Record<string, unknown>
        const details = resp.details as Array<{ field: string; message: string }>
        expect(details.some(d => d.field === 'name')).toBe(true)
      }
    })
  })

  // ─── Login schema ─────────────────────────────────────────────────────────

  describe('with LoginSchema', () => {
    let pipe: ZodValidationPipe

    beforeEach(() => {
      pipe = new ZodValidationPipe(LoginSchema)
    })

    it('passes valid login data', () => {
      const result = pipe.transform({ email: 'user@example.com', password: 'pass1234' })
      expect(result.email).toBe('user@example.com')
    })

    it('normalizes email to lowercase', () => {
      const result = pipe.transform({ email: 'User@EXAMPLE.COM', password: 'pass' })
      expect(result.email).toBe('user@example.com')
    })

    it('throws for invalid email', () => {
      expect(() => pipe.transform({ email: 'not-email', password: 'pass' })).toThrow(
        BadRequestException
      )
    })

    it('throws for missing password', () => {
      expect(() => pipe.transform({ email: 'user@example.com' })).toThrow(
        BadRequestException
      )
    })

    it('sets rememberMe default to false', () => {
      const result = pipe.transform({ email: 'a@b.com', password: 'pass' })
      expect(result.rememberMe).toBe(false)
    })
  })

  // ─── Register schema ──────────────────────────────────────────────────────

  describe('with RegisterSchema', () => {
    let pipe: ZodValidationPipe

    beforeEach(() => {
      pipe = new ZodValidationPipe(RegisterSchema)
    })

    const validPayload = {
      name: 'Alice Smith',
      email: 'alice@example.com',
      password: 'Password@1',
      confirmPassword: 'Password@1',
    }

    it('passes valid register data', () => {
      const result = pipe.transform(validPayload)
      expect(result.name).toBe('Alice Smith')
    })

    it('throws when passwords do not match', () => {
      expect(() =>
        pipe.transform({ ...validPayload, confirmPassword: 'different' })
      ).toThrow(BadRequestException)
    })

    it('throws for weak password (no uppercase)', () => {
      expect(() =>
        pipe.transform({ ...validPayload, password: 'password1', confirmPassword: 'password1' })
      ).toThrow(BadRequestException)
    })

    it('throws for weak password (no number)', () => {
      expect(() =>
        pipe.transform({ ...validPayload, password: 'PasswordOnly', confirmPassword: 'PasswordOnly' })
      ).toThrow(BadRequestException)
    })

    it('throws for name too short', () => {
      expect(() => pipe.transform({ ...validPayload, name: 'A' })).toThrow(
        BadRequestException
      )
    })
  })
})
