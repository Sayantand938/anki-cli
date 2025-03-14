// src/lib/logger.ts (No significant changes, just added type to log function)
import winston from 'winston';
import path from 'path';
import fs from 'fs';
import envPaths from 'env-paths';
import DailyRotateFile from 'winston-daily-rotate-file';

const paths = envPaths('anki-cli');
const logDir = path.join(paths.cache, 'logs');

try {
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
} catch (error) {
  console.error(
    `Failed to create log directory: ${error instanceof Error ? error.message : 'Unknown error'}`
  );
  process.exit(1);
}

const customFormat = winston.format.printf(({ level, message, timestamp }) => {
  return `[${timestamp}] [${level.toUpperCase()}] ${message}`;
});

export const logger = winston.createLogger({
  level:
    process.env.LOG_LEVEL ||
    (process.env.NODE_ENV === 'development' ? 'debug' : 'info'),
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    customFormat
  ),
  transports: [
    new DailyRotateFile({
      filename: path.join(logDir, 'cli-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '5m',
      maxFiles: '7d',
    }),
  ],
});

if (process.env.NODE_ENV === 'development') {
  logger.add(
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    })
  );
}

export function log(level: string, message: string, metadata?: any): void {
  if (metadata) {
    logger.log(level, message, metadata);
  } else {
    logger.log(level, message);
  }
}
