import type { Logger } from '@smarteverything/logging';
import { CameraOfflineError, reconnectStream } from './camera-service';
import type { Go2rtcClient } from './go2rtc-client';

export const PROBE_FIRST_DELAY_MS = 15_000;
export const PROBE_LONGEST_DELAY_MS = 120_000;
export const PROBE_TIMEOUT_MS = 15_000;

export class CameraWithoutSourceError extends Error {
  override readonly name = 'CameraWithoutSourceError';

  constructor(deviceId: string) {
    super(`The camera ${deviceId} has no stream source to reconnect.`);
  }
}

export function reconnectingProbe(
  client: Go2rtcClient,
  sourceOf: (deviceId: string) => string | null,
): CameraHealthOptions['probe'] {
  return async (deviceId, signal) => {
    const source = sourceOf(deviceId);
    if (source === null) {
      throw new CameraWithoutSourceError(deviceId);
    }
    await reconnectStream(client, deviceId, source);
    await client.frame(deviceId, 'thumb', signal);
  };
}

export type CameraFault = 'camera' | 'firewall';

export interface CameraDown {
  readonly fault: CameraFault;
  readonly since: string;
  readonly probes: number;
}

export type CameraHealthListener = (deviceId: string, down: CameraDown | null) => void;

export interface CameraHealthOptions {
  readonly faultOf: (deviceId: string) => CameraFault;
  readonly probe: (deviceId: string, signal: AbortSignal) => Promise<void>;
  readonly load: (deviceId: string) => Readonly<Record<string, number>>;
  readonly now: () => Date;
  readonly log: Logger;
}

export class CameraFirewallDownError extends CameraOfflineError {
  override readonly name = 'CameraFirewallDownError';

  constructor(
    deviceId: string,
    readonly since: string,
  ) {
    super(
      deviceId,
      `The camera ${deviceId} has been unreachable since ${since} and this computer's firewall is blocking it; it is checked again regularly.`,
    );
  }
}

export type CameraRefusals = (deviceId: string) => CameraOfflineError | null;

class Tracked {
  private missed = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    readonly fault: CameraFault,
    readonly since: string,
  ) {}

  get probes(): number {
    return this.missed;
  }

  probeMissed(): void {
    this.missed += 1;
  }

  arm(run: () => void): void {
    this.cancel();
    this.timer = setTimeout(() => {
      this.timer = null;
      run();
    }, probeDelayMs(this.missed));
    this.timer.unref();
  }

  cancel(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}

export function probeDelayMs(probes: number): number {
  return Math.min(PROBE_LONGEST_DELAY_MS, PROBE_FIRST_DELAY_MS * 2 ** probes);
}

export class CameraHealth {
  private readonly down = new Map<string, Tracked>();
  private readonly listeners = new Set<CameraHealthListener>();
  private stopped = false;

  constructor(private readonly options: CameraHealthOptions) {}

  onChange(listener: CameraHealthListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  refusal(deviceId: string): CameraOfflineError | null {
    const tracked = this.down.get(deviceId);
    if (tracked === undefined) {
      return null;
    }
    return this.options.faultOf(deviceId) === 'firewall'
      ? new CameraFirewallDownError(deviceId, tracked.since)
      : new CameraOfflineError(deviceId);
  }

  failed(deviceId: string): void {
    if (this.down.has(deviceId) || this.stopped) {
      return;
    }
    const fault = this.options.faultOf(deviceId);
    const tracked = new Tracked(fault, this.options.now().toISOString());
    this.down.set(deviceId, tracked);
    this.options.log.warn('camera.down', {
      deviceId,
      fault,
      requestsInFlight: this.options.load(deviceId),
    });
    this.announce(deviceId, tracked);
    this.schedule(deviceId, tracked);
  }

  recovered(deviceId: string): void {
    const tracked = this.down.get(deviceId);
    if (tracked === undefined) {
      return;
    }
    tracked.cancel();
    this.down.delete(deviceId);
    this.options.log.info('camera.recovered', { deviceId, probes: tracked.probes });
    this.announce(deviceId, null);
  }

  stop(): void {
    this.stopped = true;
    for (const tracked of this.down.values()) {
      tracked.cancel();
    }
    this.down.clear();
    this.listeners.clear();
  }

  private announce(deviceId: string, tracked: Tracked | null): void {
    const state: CameraDown | null =
      tracked === null
        ? null
        : { fault: tracked.fault, since: tracked.since, probes: tracked.probes };
    for (const listener of this.listeners) {
      listener(deviceId, state);
    }
  }

  private schedule(deviceId: string, tracked: Tracked): void {
    tracked.arm(() => {
      this.runProbe(deviceId, tracked).catch((cause: unknown) => {
        this.options.log.error('camera.probe_crashed', cause, { deviceId });
      });
    });
  }

  private async runProbe(deviceId: string, tracked: Tracked): Promise<void> {
    const startedAt = this.options.now().getTime();
    try {
      await this.options.probe(deviceId, AbortSignal.timeout(PROBE_TIMEOUT_MS));
    } catch (cause) {
      tracked.probeMissed();
      this.options.log.debug('camera.probe_failed', () => ({
        deviceId,
        probes: tracked.probes,
        nextInMs: probeDelayMs(tracked.probes),
        durationMs: this.options.now().getTime() - startedAt,
        reason: cause instanceof Error ? cause.name : typeof cause,
        requestsInFlight: this.options.load(deviceId),
      }));
      if (this.down.get(deviceId) === tracked) {
        this.schedule(deviceId, tracked);
      }
      return;
    }
    this.recovered(deviceId);
  }
}
