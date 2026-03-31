import { Injectable, LoggerService } from '@nestjs/common'
import * as winston from 'winston'

@Injectable()
export class AppLogger implements LoggerService {
  private logger: winston.Logger

  constructor() {
    const isProd = process.env.NODE_ENV === 'production'

    this.logger = winston.createLogger({
      level: isProd ? 'info' : 'debug',
      format: isProd
        ? winston.format.combine(winston.format.timestamp(), winston.format.json())
        : winston.format.combine(
            winston.format.timestamp({ format: 'HH:mm:ss' }),
            winston.format.colorize(),
            winston.format.printf(({ timestamp, level, message, context, ...meta }) => {
              const ctx = context ? ` [${context}]` : ''
              const extra = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : ''
              return `${timestamp} ${level}${ctx}: ${message}${extra}`
            })
          ),
      transports: [
        new winston.transports.Console(),
        ...(isProd
          ? [
              new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
              new winston.transports.File({ filename: 'logs/combined.log' }),
            ]
          : []),
      ],
    })
  }

  log(message: string, context?: string) {
    this.logger.info(message, { context })
  }

  error(message: string, trace?: string, context?: string) {
    this.logger.error(message, { trace, context })
  }

  warn(message: string, context?: string) {
    this.logger.warn(message, { context })
  }

  debug(message: string, context?: string) {
    this.logger.debug(message, { context })
  }

  verbose(message: string, context?: string) {
    this.logger.verbose(message, { context })
  }
}
