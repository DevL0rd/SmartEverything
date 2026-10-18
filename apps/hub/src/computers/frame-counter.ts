import type { Logger } from '@smarteverything/logging';

const FRAMES_LOG_MS = 60_000;

export class FrameCounter {
  private frames = 0;
  private loggedAt = 0;

  constructor(private readonly log: Logger) {}

  count(nowMs: number, externalId: string, deviceId: string | null): void {
    this.frames += 1;
    if (nowMs - this.loggedAt < FRAMES_LOG_MS) return;
    this.log.debug('computer.frames_summary', {
      externalId,
      deviceId: deviceId ?? undefined,
      frames: this.frames,
      windowMs: this.loggedAt === 0 ? undefined : nowMs - this.loggedAt,
      resolved: deviceId !== null,
    });
    this.frames = 0;
    this.loggedAt = nowMs;
  }
}
