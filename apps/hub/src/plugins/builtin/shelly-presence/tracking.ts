import { ApiError, JSON_VALUE, type JsonValue } from '@smarteverything/domain';
import { SHELLY_PRESENCE_STATUS } from '@smarteverything/shelly';
import { ShellyRpcError } from '@smarteverything/shelly/rpc';
import type { OperationPorts } from './ports';

const INVALID_ARGUMENT = -103;
const LIVE_TRACK = 'Presence.LiveTrack';
const RENEW_MARGIN_S = 5;
const RENEW_SOONEST_MS = 1000;

type Call = OperationPorts['call'];
type HolderMatch = (holder: string) => boolean;

const APP_HOLDER = 'app';

export function appHolder(clientId: string, profileId: string, name: string | undefined): string {
  return [APP_HOLDER, clientId, profileId, name ?? ''].join(':');
}

function clientHolder(clientId: string): HolderMatch {
  const prefix = `${APP_HOLDER}:${clientId}:`;
  return (holder) => holder.startsWith(prefix);
}

async function withoutEnableParameter(
  call: Call,
  params: JsonValue,
  fallback: JsonValue | null,
): Promise<JsonValue> {
  try {
    return await call(LIVE_TRACK, params, JSON_VALUE);
  } catch (cause) {
    if (!(cause instanceof ShellyRpcError) || cause.code !== INVALID_ARGUMENT) throw cause;
    return fallback === null ? null : call(LIVE_TRACK, fallback, JSON_VALUE);
  }
}

export function startLiveTrack(call: Call): Promise<JsonValue> {
  return withoutEnableParameter(call, { enable: true }, {});
}

export class ShellyTracking {
  private readonly holders = new Set<string>();
  private renewal: ReturnType<typeof setTimeout> | null = null;
  private pending: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly call: Call,
    private readonly failed: (cause: unknown) => void,
  ) {}

  hold(holder: string): Promise<{ readonly enabled: boolean }> {
    return this.serial(async () => {
      if (this.renewal === null) await this.start();
      this.holders.add(holder);
      return { enabled: true };
    });
  }

  release(holder: string): Promise<{ readonly enabled: boolean }> {
    return this.releaseMatching((held) => held === holder);
  }

  releaseClient(clientId: string): Promise<{ readonly enabled: boolean }> {
    return this.releaseMatching(clientHolder(clientId));
  }

  forget(holder: string): { readonly enabled: boolean } {
    return this.forgetMatching((held) => held === holder);
  }

  forgetClient(clientId: string): { readonly enabled: boolean } {
    return this.forgetMatching(clientHolder(clientId));
  }

  remember(holder: string): { readonly enabled: boolean } {
    this.holders.add(holder);
    return { enabled: true };
  }

  suspend(): void {
    this.cancelRenewal();
  }

  resume(): void {
    this.serial(async () => {
      if (this.holders.size > 0 && this.renewal === null) await this.start();
    }).catch(this.failed);
  }

  private releaseMatching(match: HolderMatch): Promise<{ readonly enabled: boolean }> {
    return this.serial(async () => {
      if (!this.drop(match) || this.holders.size > 0) return { enabled: this.holders.size > 0 };
      this.cancelRenewal();
      await withoutEnableParameter(this.call, { enable: false }, null);
      return { enabled: false };
    });
  }

  private forgetMatching(match: HolderMatch): { readonly enabled: boolean } {
    this.drop(match);
    return { enabled: this.holders.size > 0 };
  }

  private drop(match: HolderMatch): boolean {
    const held = [...this.holders].filter(match);
    for (const holder of held) this.holders.delete(holder);
    return held.length > 0;
  }

  private serial<T>(work: () => Promise<T>): Promise<T> {
    const next = this.pending.then(work);
    // eslint-disable-next-line local/no-swallowed-errors -- the caller receives the same failure from the task result
    this.pending = next.catch(() => undefined);
    return next;
  }

  private cancelRenewal(): void {
    if (this.renewal !== null) clearTimeout(this.renewal);
    this.renewal = null;
  }

  private renew(): void {
    this.renewal = null;
    this.serial(async () => {
      if (this.holders.size > 0) await this.start();
    }).catch(this.failed);
  }

  private async start(): Promise<void> {
    const started = Date.now();
    await startLiveTrack(this.call);
    const status = await this.call('Presence.GetStatus', {}, SHELLY_PRESENCE_STATUS);
    const timer = status.live_track;
    if (timer === undefined || timer === null)
      throw new ApiError('upstream_failed', 'The sensor did not report a live tracking timer.');
    const elapsed = Math.max(
      (Date.now() - started) / 1000,
      Date.now() / 1000 - timer.timer_started_at,
    );
    const remaining = timer.timer_duration - Math.max(0, elapsed);
    if (remaining <= 0)
      throw new ApiError('upstream_failed', 'The sensor live tracking timer has already expired.');
    this.cancelRenewal();
    this.renewal = setTimeout(
      () => {
        this.renew();
      },
      Math.max(RENEW_SOONEST_MS, (remaining - RENEW_MARGIN_S) * 1000),
    );
    this.renewal.unref();
  }
}
