import { Logger, passesThreshold, type LogLevel, type LogPayload } from '@smarteverything/logging';

export function logEnabled(level: LogLevel): boolean {
  return passesThreshold(level, Logger.level);
}

export function hashText(text: string): string {
  let hash = 5381;
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) + hash + text.charCodeAt(index)) | 0;
  }
  return (hash >>> 0).toString(36);
}

export function errorFields(error: unknown): LogPayload {
  if (error instanceof Error) {
    return { errorName: error.name, errorMessage: error.message };
  }
  return { errorMessage: String(error) };
}

export class LogTally {
  private counts = new Map<string, number>();
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly log: Logger,
    private readonly event: string,
    private readonly everyMs: number,
    private readonly extra: () => LogPayload = () => ({}),
  ) {}

  bump(key: string, by = 1): void {
    if (!logEnabled('debug')) return;
    this.counts.set(key, (this.counts.get(key) ?? 0) + by);
    this.timer ??= setTimeout(this.flush, this.everyMs);
  }

  private readonly flush = (): void => {
    this.timer = null;
    const counts = Object.fromEntries(this.counts);
    this.counts = new Map();
    try {
      const payload = { ...counts, ...this.extra(), windowMs: this.everyMs };
      this.log.debug(this.event, payload);
      // eslint-disable-next-line local/no-swallowed-errors -- logging code cannot log its own failure
    } catch {
      return;
    }
  };
}
