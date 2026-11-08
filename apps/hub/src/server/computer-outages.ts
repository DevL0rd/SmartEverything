import type { Logger } from '@smarteverything/logging';

interface Outage {
  readonly startedAt: number;
  readonly reason: string;
}

export class ComputerOutages {
  private readonly open = new Map<string, Outage>();

  constructor(
    private readonly log: Logger,
    private readonly now: () => number = (): number => performance.now(),
  ) {}

  lost(deviceId: string, reason: string): void {
    if (this.open.has(deviceId)) {
      return;
    }
    this.open.set(deviceId, { startedAt: this.now(), reason });
    this.log.warn('computer.offline', { deviceId, reason });
  }

  returned(deviceId: string): void {
    const outage = this.open.get(deviceId);
    if (outage === undefined) {
      return;
    }
    this.open.delete(deviceId);
    this.log.info('computer.back_online', {
      deviceId,
      reason: outage.reason,
      offlineMs: Math.round(this.now() - outage.startedAt),
    });
  }
}
