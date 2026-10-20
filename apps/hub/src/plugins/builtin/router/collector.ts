import type { RouterSnapshot } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import { PolledLoop, type Cadence } from '../polled-loop';
import { WireGate } from '../wire-gate';
import { parseCollectOutput } from './collect-parse';
import { buildFrame, type FrameParts, type FrameState } from './frame';
import type { RouterShell } from './router-shell';
import { messageOf } from '@smarteverything/logging';

const FULL_VIEWED_MS = 10_000;
const FULL_QUIET_MS = 30_000;
const WIRE_QUIET_MS = 30_000;
const SAMPLE_SECONDS = 1;
const MAX_BACKOFF_SECONDS = 30;

interface CollectorOptions {
  readonly shell: RouterShell;
  readonly pingTarget: string;
  readonly log: Logger;
  readonly record: (snapshot: RouterSnapshot) => void;
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
  #fullAt = 0;
  readonly #wire = new WireGate(WIRE_QUIET_MS);
  #failures = 0;
  readonly #loop = new PolledLoop({
    sampleSeconds: SAMPLE_SECONDS,
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
      this.#emit(true);
    }
  }

  stop(): void {
    this.#loop.stop();
    this.options.shell.close();
  }

  async #collectOnce(): Promise<void> {
    const now = Date.now();
    const slowTick =
      this.#frame === null ||
      now - this.#fullAt >= (this.#loop.viewed ? FULL_VIEWED_MS : FULL_QUIET_MS);
    try {
      const raw = await this.options.shell.collect(this.#requestLine(slowTick));
      const { parts, state } = buildFrame(parseCollectOutput(raw), this.#frame, Date.now());
      const changed = this.#connection.state !== 'online';
      this.#fullAt = slowTick ? now : this.#fullAt;
      this.#frame = state;
      this.#parts = parts;
      this.#connection = { state: 'online' };
      this.#failures = 0;
      this.#loop.setSampleSeconds(SAMPLE_SECONDS);
      this.#emit(changed);
    } catch (error) {
      this.#markUnreachable(error);
    }
  }

  #emit(force: boolean): void {
    const snapshot = this.#snapshot();
    this.options.record(snapshot);
    if (this.#wire.due(this.#loop.viewed, force)) {
      this.options.publish(snapshot);
    }
  }

  #requestLine(slowTick: boolean): string {
    const reconnecting = this.#connection.state !== 'online';
    const pingMode = slowTick ? 2 : 3;
    return [this.options.pingTarget, pingMode, slowTick ? 1 : 0, reconnecting ? 1 : 0].join(' ');
  }

  #markUnreachable(error: unknown): void {
    const reason = messageOf(error);
    this.#failures += 1;
    this.#loop.setSampleSeconds(Math.min(2 ** this.#failures, MAX_BACKOFF_SECONDS));
    const changed = this.#connection.state !== 'unreachable';
    const since =
      this.#connection.state === 'unreachable' ? this.#connection.since : new Date().toISOString();
    if (changed) {
      this.options.log.warn('router.unreachable', { reason });
    }
    this.#connection = { state: 'unreachable', reason, since };
    this.#emit(changed);
  }

  #snapshot(): RouterSnapshot {
    return {
      at: new Date().toISOString(),
      connection: this.#connection,
      cadence: this.#loop.cadence,
      intervalSeconds: this.#loop.intervalSeconds,
      ...this.#parts,
      people: [],
    };
  }
}
