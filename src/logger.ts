// Logging utility for the research agent system

export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3
}

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: string;
  error?: Error;
}

class Logger {
  private logLevel: LogLevel = LogLevel.INFO;

  setLogLevel(level: LogLevel): void {
    this.logLevel = level;
  }

  private shouldLog(level: LogLevel): boolean {
    return level <= this.logLevel;
  }

  private formatMessage(level: LogLevel, message: string, context?: string, error?: Error): string {
    const timestamp = new Date().toISOString();
    const levelStr = LogLevel[level];
    const contextStr = context ? `[${context}] ` : '';
    const errorStr = error ? `\nError details: ${error.message}\nStack: ${error.stack}` : '';
    
    return `${timestamp} ${levelStr}: ${contextStr}${message}${errorStr}`;
  }

  error(message: string, context?: string, error?: Error): void {
    if (this.shouldLog(LogLevel.ERROR)) {
      console.error(this.formatMessage(LogLevel.ERROR, message, context, error));
    }
  }

  warn(message: string, context?: string): void {
    if (this.shouldLog(LogLevel.WARN)) {
      console.error(this.formatMessage(LogLevel.WARN, message, context));
    }
  }

  info(message: string, context?: string): void {
    if (this.shouldLog(LogLevel.INFO)) {
      console.error(this.formatMessage(LogLevel.INFO, message, context));
    }
  }

  debug(message: string, context?: string): void {
    if (this.shouldLog(LogLevel.DEBUG)) {
      console.error(this.formatMessage(LogLevel.DEBUG, message, context));
    }
  }
}

// Export singleton logger instance
export const logger = new Logger();

// Initialize log level from environment variable if set
const envLogLevel = process.env.LOG_LEVEL?.toUpperCase();
if (envLogLevel && envLogLevel in LogLevel) {
  logger.setLogLevel(LogLevel[envLogLevel as keyof typeof LogLevel]);
}

// Unified error handling utilities
export function handleAsyncError<T>(
  operation: () => Promise<T>,
  context: string,
  fallbackValue?: T
): Promise<T | undefined> {
  return operation().catch((error: unknown) => {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error(`Error in ${context}`, context, err);
    return fallbackValue;
  });
}

export function handleSyncError<T>(
  operation: () => T,
  context: string,
  fallbackValue?: T
): T | undefined {
  try {
    return operation();
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error(`Error in ${context}`, context, err);
    return fallbackValue;
  }
}

export function safeJsonParse<T = any>(
  jsonString: string,
  context: string = 'JSON parsing',
  fallbackValue?: T
): T | undefined {
  return handleSyncError(
    () => JSON.parse(jsonString) as T,
    context,
    fallbackValue
  );
}

export function logAndThrow(message: string, context?: string): never {
  const error = new Error(message);
  logger.error(message, context, error);
  throw error;
}