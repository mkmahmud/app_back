import { AllExceptionsFilter } from '@/common/filters/all-exceptions.filter'
import {
  HttpException,
  HttpStatus,
  NotFoundException,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { ZodError, z } from 'zod'

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockJson = jest.fn()
const mockStatus = jest.fn().mockReturnValue({ json: mockJson })
const mockResponse = { status: mockStatus }
const mockRequest = { method: 'GET', url: '/test' }

const mockHost = {
  switchToHttp: () => ({
    getResponse: () => mockResponse,
    getRequest: () => mockRequest,
  }),
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('AllExceptionsFilter', () => {
  let filter: AllExceptionsFilter

  beforeEach(() => {
    filter = new AllExceptionsFilter()
    jest.clearAllMocks()
  })

  // ─── HttpException ────────────────────────────────────────────────────────

  describe('HttpException handling', () => {
    it('handles NotFoundException with correct status and code', () => {
      filter.catch(new NotFoundException('User not found'), mockHost as any)

      expect(mockStatus).toHaveBeenCalledWith(404)
      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          data: null,
          code: 'NOT_FOUND',
          statusCode: 404,
        })
      )
    })

    it('handles UnauthorizedException', () => {
      filter.catch(new UnauthorizedException('Token expired'), mockHost as any)

      expect(mockStatus).toHaveBeenCalledWith(401)
      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'UNAUTHORIZED', success: false })
      )
    })

    it('handles custom code in exception response', () => {
      filter.catch(
        new HttpException({ code: 'CUSTOM_CODE', message: 'Custom error' }, 400),
        mockHost as any
      )

      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'CUSTOM_CODE' })
      )
    })

    it('handles class-validator array messages', () => {
      filter.catch(
        new BadRequestException({ message: ['email must be valid', 'name is required'] }),
        mockHost as any
      )

      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Validation failed',
          details: expect.arrayContaining(['email must be valid']),
        })
      )
    })
  })

  // ─── Prisma errors ────────────────────────────────────────────────────────

  describe('Prisma error handling', () => {
    it('handles P2002 unique constraint as 409 Conflict', () => {
      const prismaError = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed',
        { code: 'P2002', clientVersion: '5.0', meta: { target: ['email'] } }
      )

      filter.catch(prismaError, mockHost as any)

      expect(mockStatus).toHaveBeenCalledWith(409)
      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'CONFLICT', statusCode: 409 })
      )
    })

    it('handles P2025 record not found as 404', () => {
      const prismaError = new Prisma.PrismaClientKnownRequestError(
        'Record not found',
        { code: 'P2025', clientVersion: '5.0', meta: {} }
      )

      filter.catch(prismaError, mockHost as any)

      expect(mockStatus).toHaveBeenCalledWith(404)
      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'NOT_FOUND' })
      )
    })

    it('handles other Prisma errors as 500', () => {
      const prismaError = new Prisma.PrismaClientKnownRequestError(
        'Connection failed',
        { code: 'P1001', clientVersion: '5.0', meta: {} }
      )

      filter.catch(prismaError, mockHost as any)

      expect(mockStatus).toHaveBeenCalledWith(500)
      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'DATABASE_ERROR' })
      )
    })
  })

  // ─── Zod errors ───────────────────────────────────────────────────────────

  describe('ZodError handling', () => {
    it('handles ZodError as 400 with VALIDATION_ERROR code', () => {
      const schema = z.object({ email: z.string().email() })
      let zodError: ZodError | null = null
      try {
        schema.parse({ email: 'invalid' })
      } catch (e) {
        zodError = e as ZodError
      }

      filter.catch(zodError!, mockHost as any)

      expect(mockStatus).toHaveBeenCalledWith(400)
      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'VALIDATION_ERROR',
          details: expect.any(Array),
        })
      )
    })
  })

  // ─── Unknown errors ───────────────────────────────────────────────────────

  describe('Unknown error handling', () => {
    it('handles plain Error as 500', () => {
      filter.catch(new Error('Something broke'), mockHost as any)

      expect(mockStatus).toHaveBeenCalledWith(500)
      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'INTERNAL_SERVER_ERROR',
          success: false,
        })
      )
    })

    it('handles non-Error throws as 500', () => {
      filter.catch('a string was thrown', mockHost as any)

      expect(mockStatus).toHaveBeenCalledWith(500)
    })

    it('always sets success: false', () => {
      filter.catch(new Error('any'), mockHost as any)
      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, data: null })
      )
    })
  })
})
