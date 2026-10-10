export const LOG_LEVELS = ['trace', 'debug', 'info', 'warn', 'error', 'exception', 'none'] as const;

export type LogLevel = (typeof LOG_LEVELS)[number];

const RANK: Readonly<Record<LogLevel, number>> = {
  trace: 0,
  debug: 1,
  info: 2,
  warn: 3,
  error: 4,
  exception: 5,
  none: 6,
};

export function rankOf(level: LogLevel): number {
  return RANK[level];
}

export function passesThreshold(level: LogLevel, threshold: LogLevel): boolean {
  if (level === 'none') {
    return false;
  }
  return RANK[level] >= RANK[threshold];
}
