export const LOG_LEVELS = ['trace', 'debug', 'info', 'warn', 'error', 'exception', 'none'] as const;

export type LogLevel = (typeof LOG_LEVELS)[number];

export function passesThreshold(level: LogLevel, threshold: LogLevel): boolean {
  if (level === 'none') {
    return false;
  }
  return LOG_LEVELS.indexOf(level) >= LOG_LEVELS.indexOf(threshold);
}
