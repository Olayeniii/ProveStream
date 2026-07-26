type LogLevel = 'info' | 'warn' | 'error';

const RESET = '\x1b[0m';
const COLORS: Record<LogLevel, string> = {
  info: '\x1b[36m',
  warn: '\x1b[33m',
  error: '\x1b[31m',
};

export interface Logger {
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}

function write(
  scope: string,
  level: LogLevel,
  message: string,
  context?: Record<string, unknown>,
): void {
  const timestamp = new Date().toISOString();
  const color = COLORS[level];
  const line = `${color}[${timestamp}] [${scope}] ${level.toUpperCase()}${RESET} ${message}`;
  const destination = level === 'error' ? console.error : console.log;

  if (context !== undefined) {
    destination(line, context);
  } else {
    destination(line);
  }
}

/** Creates a scoped logger so log lines can be traced back to their module. */
export function createLogger(scope: string): Logger {
  return {
    info: (message, context) => {
      write(scope, 'info', message, context);
    },
    warn: (message, context) => {
      write(scope, 'warn', message, context);
    },
    error: (message, context) => {
      write(scope, 'error', message, context);
    },
  };
}
