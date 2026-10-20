import type { HubFrame, RemoteEarHubMessage, RemoteEarNodeMessage } from '@smarteverything/domain';
import { background, type Logger } from '@smarteverything/logging';
import { systemClock, type Clock } from '../../clock';
import type { EarRuntimeLost } from './runtime-lost';
import { wakeEarEngine, type EarEngine } from './ear-engine';
import { WakeDiagnostics } from './wake-diagnostics';
import { pcmOf } from './ear-audio';
import type { KeywordEngine } from './relayed-spotter';
import { RelayedEar } from './relayed-ear';

export type EarsFrame = Extract<
  HubFrame,
  { readonly type: 'ears_open' | 'ears_audio' | 'ears_close' | 'ears' | 'ears_score' }
>;

export type RemoteEarSend = (key: string, message: RemoteEarNodeMessage) => void;

export type ScoredSend = (id: string, heard: boolean) => void;

export type ScoreFailedSend = (id: string, reason: string) => void;

export interface EarHostPort {
  readonly load: () => Promise<void>;
  readonly receive: (frame: EarsFrame) => void;
  readonly stop: () => Promise<void>;
}

export type EarHostFactory = (
  send: RemoteEarSend,
  scored: ScoredSend,
  scoreFailed: ScoreFailedSend,
) => EarHostPort;

export interface EarHostDeps {
  readonly engine: EarEngine;
  readonly diagnostics?: WakeDiagnostics | null;
  readonly clock: Pick<Clock, 'now' | 'at'>;
  readonly log: Logger;
}

const EARS_FRAME_TYPES: ReadonlySet<string> = new Set([
  'ears_open',
  'ears_audio',
  'ears_close',
  'ears',
  'ears_score',
]);

export function isEarsFrame(frame: HubFrame): frame is EarsFrame {
  return EARS_FRAME_TYPES.has(frame.type);
}

export class EarHost implements EarHostPort {
  private readonly ears = new Map<string, RelayedEar>();

  constructor(
    private readonly deps: EarHostDeps,
    private readonly send: RemoteEarSend,
    private readonly scored: ScoredSend,
    private readonly scoreFailed: ScoreFailedSend,
  ) {}

  load(): Promise<void> {
    return this.deps.engine.load();
  }

  receive(frame: EarsFrame): void {
    switch (frame.type) {
      case 'ears_open':
        this.open(frame);
        return;
      case 'ears_audio':
        this.audio(frame.key, frame.packets);
        return;
      case 'ears_close':
        this.close(frame.key);
        return;
      case 'ears':
        this.message(frame.key, frame.ear);
        return;
      case 'ears_score':
        background(this.score(frame), 'ear_host.score_failed');
        return;
    }
  }

  async stop(): Promise<void> {
    const ears = [...this.ears.values()];
    this.ears.clear();
    this.deps.log.info('ear_host.stopped', { ears: ears.length });
    await Promise.all(ears.map((ear) => ear.close()));
  }

  private open(frame: Extract<EarsFrame, { readonly type: 'ears_open' }>): void {
    const { key, kind } = frame.source;
    const previous = this.ears.get(key);
    if (previous !== undefined) {
      this.deps.log.warn('ear_host.reopened', { key, kind });
      this.retire(previous);
    }
    const ear = new RelayedEar({
      source: frame.source,
      codec: frame.codec,
      engine: this.deps.engine,
      diagnostics: this.deps.diagnostics ?? null,
      send: (message): void => {
        this.send(key, message);
      },
      clock: this.deps.clock,
      log: this.deps.log,
    });
    this.ears.set(key, ear);
    this.deps.log.info('ear_host.opened', { key, kind, codec: frame.codec, ears: this.ears.size });
    ear.receive({ kind: 'config', config: frame.config });
  }

  private audio(key: string, packets: readonly string[]): void {
    const ear = this.ears.get(key);
    if (ear === undefined) {
      this.deps.log.debug('ear_host.audio_without_ear', { key });
      return;
    }
    for (const packet of packets) {
      ear.hear(Buffer.from(packet, 'base64'));
    }
  }

  private close(key: string): void {
    const ear = this.ears.get(key);
    if (ear === undefined) {
      this.deps.log.warn('ear_host.close_without_ear', { key });
      this.send(key, { kind: 'closed' });
      return;
    }
    this.ears.delete(key);
    this.deps.log.info('ear_host.closed', { key, ears: this.ears.size });
    this.retire(ear, key);
  }

  private async score(frame: Extract<EarsFrame, { readonly type: 'ears_score' }>): Promise<void> {
    let heard: boolean;
    try {
      heard = await this.deps.engine
        .spotter()
        .hears(frame.keywords.join('\n'), frame.threshold, pcmOf(frame.pcm));
    } catch (cause) {
      this.deps.log.error('ear_host.score_failed', cause);
      this.scoreFailed(frame.id, cause instanceof Error ? cause.message : String(cause));
      return;
    }
    this.scored(frame.id, heard);
  }

  private message(key: string, message: RemoteEarHubMessage): void {
    const ear = this.ears.get(key);
    if (ear === undefined) {
      this.deps.log.warn('ear_host.message_without_ear', { key, kind: message.kind });
      return;
    }
    ear.receive(message);
  }

  private retire(ear: RelayedEar, acknowledge?: string): void {
    background(this.closing(ear, acknowledge), 'ear_host.close_failed');
  }

  private async closing(ear: RelayedEar, acknowledge: string | undefined): Promise<void> {
    try {
      await ear.close();
    } finally {
      if (acknowledge !== undefined) this.send(acknowledge, { kind: 'closed' });
    }
  }
}

export interface EarHostForOptions {
  readonly now: () => Date;
  readonly dataDirectory: string | null;
  readonly log: Logger;
  readonly lost: EarRuntimeLost;
}

export interface EarHosting {
  readonly factory: EarHostFactory;
  readonly stop: () => void;
}

export function earHostFor(options: EarHostForOptions): EarHosting {
  const engine = wakeEarEngine(options.lost);
  const clock = { now: options.now, at: systemClock.at };
  const diagnostics =
    options.dataDirectory === null
      ? null
      : new WakeDiagnostics({
          dataDirectory: options.dataDirectory,
          spotter: (): KeywordEngine => engine.spotter(),
          clock,
          log: options.log,
        });
  diagnostics?.start().catch((cause: unknown) => {
    options.log.error('wake.diagnostic_watch_failed', cause);
  });
  const deps: EarHostDeps = { engine, diagnostics, clock, log: options.log };
  return {
    factory: (send, scored, scoreFailed): EarHostPort =>
      new EarHost(deps, send, scored, scoreFailed),
    stop: (): void => {
      diagnostics?.stop();
    },
  };
}
