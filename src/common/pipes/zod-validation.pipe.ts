import { PipeTransform, Injectable, BadRequestException } from '@nestjs/common'
import { ZodSchema, ZodError } from 'zod'

@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private schema: ZodSchema) {}

  transform(value: unknown) {
    const result = this.schema.safeParse(value)
    if (!result.success) {
      const issues = (result.error as ZodError).issues.map(i => ({
        field: i.path.join('.'),
        message: i.message,
      }))
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: issues,
      })
    }
    return result.data
  }
}
