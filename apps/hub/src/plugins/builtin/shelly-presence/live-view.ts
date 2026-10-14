import {
  ApiError,
  SHELLY_PRESENCE_STATUS,
  JSON_VALUE,
  type JsonValue,
} from '@smarteverything/domain';
import type { ShellyRpc } from './rpc';

const VIEW_LEASE_MS = 45000;
const VIEW_RENEW_MS = 30000;
export class ShellyLiveView {
  private readonly viewers = new Map<string, ReturnType<typeof setTimeout>>();
  private renewal: ReturnType<typeof setTimeout> | null = null;
  private pending: Promise<unknown> = Promise.resolve();
  constructor(
    private readonly rpc: () => ShellyRpc,
    private readonly version: string,
    private readonly changed: () => Promise<void>,
    private readonly failed: (cause: unknown) => void,
  ) {}
  set(
    holder: string,
    enabled: boolean,
  ): Promise<{ enabled: boolean; expiresAt: string | null; renewAfterMs: number | null }> {
    const pending = this.pending.then(() => this.setHolder(holder, enabled));
    this.pending = pending.catch(() => undefined);
    return pending;
  }
  private async setHolder(
    holder: string,
    enabled: boolean,
  ): Promise<{ enabled: boolean; expiresAt: string | null; renewAfterMs: number | null }> {
    const previous = this.viewers.get(holder);
    if (previous !== undefined) clearTimeout(previous);
    this.viewers.delete(holder);
    if (!enabled) {
      await this.stopIfUnused();
      return { enabled: false, expiresAt: null, renewAfterMs: null };
    }
    const first = this.viewers.size === 0 && previous === undefined;
    const timeout = setTimeout(() => {
      this.viewers.delete(holder);
      this.pending = this.pending.then(() => this.stopIfUnused()).catch(this.failed);
    }, VIEW_LEASE_MS);
    timeout.unref();
    this.viewers.set(holder, timeout);
    if (first) {
      try {
        await this.start();
      } catch (cause) {
        clearTimeout(timeout);
        this.viewers.delete(holder);
        throw cause;
      }
    }
    return {
      enabled: true,
      expiresAt: new Date(Date.now() + VIEW_LEASE_MS).toISOString(),
      renewAfterMs: VIEW_RENEW_MS,
    };
  }
  dispose(): void {
    for (const timer of this.viewers.values()) clearTimeout(timer);
    this.viewers.clear();
    this.cancelRenewal();
  }
  private cancelRenewal(): void {
    if (this.renewal !== null) clearTimeout(this.renewal);
    this.renewal = null;
  }
  private async start(): Promise<void> {
    const params: JsonValue = this.version.includes('presenceg4prod') ? { enable: true } : {};
    const started = Date.now();
    await this.rpc().call('Presence.LiveTrack', params, JSON_VALUE);
    const status = await this.rpc().call('Presence.GetStatus', {}, SHELLY_PRESENCE_STATUS);
    if (status.live_track === undefined || status.live_track === null)
      throw new ApiError('upstream_failed', 'The sensor did not report a live tracking timer.');
    const timer = status.live_track;
    const elapsed = Math.max(
      (Date.now() - started) / 1000,
      Date.now() / 1000 - timer.timer_started_at,
    );
    const remaining = timer.timer_duration - Math.max(0, elapsed);
    this.cancelRenewal();
    if (remaining <= 0)
      throw new ApiError('upstream_failed', 'The sensor live tracking timer has already expired.');
    this.renewal = setTimeout(
      () => {
        this.pending = this.pending
          .then(async (): Promise<void> => {
            if (this.viewers.size > 0) await this.start();
          })
          .catch(this.failed);
      },
      Math.max(1000, (remaining - 5) * 1000),
    );
    this.renewal.unref();
    await this.changed();
  }
  private async stopIfUnused(): Promise<void> {
    if (this.viewers.size > 0) return;
    this.cancelRenewal();
    if (this.version.includes('presenceg4prod'))
      await this.rpc().call('Presence.LiveTrack', { enable: false }, JSON_VALUE);
    await this.changed();
  }
}
