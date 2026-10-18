import type { Logger } from '@smarteverything/logging';
import type { RawData } from 'ws';

function rawSize(data: RawData): number {
  if (Array.isArray(data)) return data.reduce((total, part) => total + part.byteLength, 0);
  return data.byteLength;
}

export class RelayLog {
  private readonly openedAt = performance.now();
  private frames = 0;
  private bytes = 0;
  private upstreamFrames = 0;
  private upstreamBytes = 0;
  private pending = 0;

  constructor(private readonly log: Logger) {}

  opened(protocol: string): void {
    this.log.info('stream.relay_opened', { protocol });
  }

  upstreamOpen(queuedFrames: number): void {
    this.log.debug('stream.upstream_open', () => ({ afterMs: this.openMs(), queuedFrames }));
  }

  forwarded(towardsUpstream: boolean, data: RawData, queued: boolean): void {
    const size = rawSize(data);
    if (towardsUpstream) {
      this.frames += 1;
      this.bytes += size;
      if (queued) this.pending += 1;
    } else {
      this.upstreamFrames += 1;
      this.upstreamBytes += size;
    }
  }

  closed(side: string, code: number, reason: Buffer): void {
    this.log.info('stream.relay_closed', {
      side,
      closeCode: code,
      reason: reason.toString('utf8').slice(0, 120),
      ...this.summary(),
    });
  }

  failed(event: 'stream.relay_failed' | 'stream.client_failed', cause: Error): void {
    this.log.warn(event, { reason: cause.message, ...this.summary() });
  }

  private openMs(): number {
    return Math.round(performance.now() - this.openedAt);
  }

  private summary(): Record<string, number> {
    return {
      openMs: this.openMs(),
      frames: this.frames,
      bytes: this.bytes,
      upstreamFrames: this.upstreamFrames,
      upstreamBytes: this.upstreamBytes,
      pending: this.pending,
    };
  }
}
