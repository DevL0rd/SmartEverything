import type { HubFrame, RemoteEarHubMessage, RemoteEarNodeMessage } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import { systemClock, type Clock } from '../../clock';
import { wakeEarEngine, type EarEngine } from './ear-engine';
import { RelayedEar } from './relayed-ear';

export type EarsFrame = Extract<
  HubFrame,
  { readonly type: 'ears_open' | 'ears_audio' | 'ears_close' | 'ears' }
>;

export type RemoteEarSend = (key: string, message: RemoteEarNodeMessage) => void;

export interface EarHostPort {
  readonly load: () => Promise<void>;
  readonly receive: (frame: EarsFrame) => void;
  readonly stop: () => Promise<void>;
}

export type EarHostFactory = (send: RemoteEarSend) => EarHostPort;

export interface EarHostDeps {
  readonly engine: EarEngine;
  readonly clock: Pick<Clock, 'now' | 'at'>;
  readonly log: Logger;
}

const EARS_FRAME_TYPES: ReadonlySet<string> = new Set([
  'ears_open',
  'ears_audio',
  'ears_close',
  'ears',
]);

export function isEarsFrame(frame: HubFrame): frame is EarsFrame {
  return EARS_FRAME_TYPES.has(frame.type);
}

export class EarHost implements EarHostPort {
  private readonly ears = new Map<string, RelayedEar>();

  constructor(
    private readonly deps: EarHostDeps,
    private readonly send: RemoteEarSend,
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
      this.drop(previous);
    }
    const ear = new RelayedEar({
      source: frame.source,
      codec: frame.codec,
      engine: this.deps.engine,
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
      return;
    }
    this.ears.delete(key);
    this.deps.log.info('ear_host.closed', { key, ears: this.ears.size });
    this.drop(ear);
  }

  private message(key: string, message: RemoteEarHubMessage): void {
    const ear = this.ears.get(key);
    if (ear === undefined) {
      this.deps.log.warn('ear_host.message_without_ear', { key, kind: message.kind });
      return;
    }
    ear.receive(message);
  }

  private drop(ear: RelayedEar): void {
    ear.close().catch((cause: unknown) => {
      this.deps.log.error('ear_host.close_failed', cause);
    });
  }
}

export interface EarHostForOptions {
  readonly now: () => Date;
  readonly log: Logger;
}

export function earHostFor(options: EarHostForOptions): EarHostFactory {
  const deps: EarHostDeps = {
    engine: wakeEarEngine(),
    clock: { now: options.now, at: systemClock.at },
    log: options.log,
  };
  return (send) => new EarHost(deps, send);
}
