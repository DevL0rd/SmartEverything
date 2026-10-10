import type { RouterSnapshot } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import { PolledLoop, type Cadence } from '../polled-loop';
import { parseCollectOutput } from './collect-parse';
import { buildFrame, type FrameParts, type FrameState } from './frame';
import type { RouterShell } from './router-shell';

const FAST_INTERVAL_SECONDS = 2;
const SLOW_INTERVAL_SECONDS = 30;
const SLOW_EVERY = 10;

interface CollectorOptions {
  readonly shell: RouterShell;
  readonly pingTarget: string;
  readonly log: Logger;
  readonly publish: (snapshot: RouterSnapshot) => void;
}

const EMPTY_PARTS: FrameParts = {
  info: null,
  system: null,
  network: null,
  radios: [],
  stations: [],
  clients: [],
};

export class RouterCollector {
  #frame: FrameState | null = null;
  #parts: FrameParts = EMPTY_PARTS;
  #connection: RouterSnapshot['connection'] = { state: 'connecting' };
  #tick = 0;
  readonly #loop = new PolledLoop({
    fastSeconds: FAST_INTERVAL_SECONDS,
    slowSeconds: SLOW_INTERVAL_SECONDS,
    tick: (): Promise<void> => this.#collectOnce(),
  });

  constructor(private readonly options: CollectorOptions) {}

  get latest(): RouterSnapshot {
    return this.#snapshot();
  }

  get frame(): FrameState | null {
    return this.#frame;
  }

  get shell(): RouterShell {
    return this.options.shell;
  }

  refreshSoon(): void {
    this.#loop.runNow();
  }

  setCadence(cadence: Cadence): void {
    this.#loop.setCadence(cadence);
    if (cadence === 'paused') {
      this.#connection = { state: 'paused' };
      this.options.publish(this.#snapshot());
    }
  }

  stop(): void {
    this.#loop.stop();
    this.options.shell.close();
  }

  async #collectOnce(): Promise<void> {
    this.#tick += 1;
    const slowTick =
      this.#loop.cadence === 'slow' || this.#frame === null || this.#tick % SLOW_EVERY === 0;
    try {
      const raw = await this.options.shell.collect(this.#requestLine(slowTick));
      const { parts, state } = buildFrame(parseCollectOutput(raw), this.#frame);
      this.#frame = state;
      this.#parts = parts;
      this.#connection = { state: 'online' };
      this.options.publish(this.#snapshot());
    } catch (error) {
      this.#markUnreachable(error);
    }
  }

  #requestLine(slowTick: boolean): string {
    const reconnecting = this.#connection.state !== 'online';
    const pingMode = slowTick ? 2 : 3;
    return [this.options.pingTarget, pingMode, slowTick ? 1 : 0, reconnecting ? 1 : 0].join(' ');
  }

  #markUnreachable(error: unknown): void {
    const reason = reasonOf(error);
    const since =
      this.#connection.state === 'unreachable' ? this.#connection.since : new Date().toISOString();
    if (this.#connection.state !== 'unreachable') {
      this.options.log.warn('router.unreachable', { reason });
    }
    this.#connection = { state: 'unreachable', reason, since };
    this.options.publish(this.#snapshot());
  }

  #snapshot(): RouterSnapshot {
    return {
      at: new Date().toISOString(),
      connection: this.#connection,
      cadence: this.#loop.cadence,
      intervalSeconds: this.#loop.intervalSeconds,
      ...this.#parts,
    };
  }
}

function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
