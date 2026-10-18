import type {
  EarCodec,
  EarSource,
  ListeningConfig,
  PauseChoiceMs,
  RemoteEarHubMessage,
  RemoteEarNodeMessage,
  WakeSensitivity,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import { messageOf } from '@smarteverything/logging';
import type { Clock } from '../../clock';
import { Ear, type SpeechSegment } from '../../wake-name/ear';
import type { EarEngine } from './ear-engine';
import { encodePcm, GrantedClaims, listeningSegmentOf } from './ear-audio';
import { packetDecoderFor, type PacketDecoder } from './packet-decoder';
import { RelayedSpotter } from './relayed-spotter';

const PREROLL_SAMPLES_PER_MS = 16;

type RestReason = Extract<RemoteEarHubMessage, { readonly kind: 'rest' }>['reason'];

export interface RelayedEarOptions {
  readonly source: EarSource;
  readonly codec: EarCodec;
  readonly engine: EarEngine;
  readonly send: (message: RemoteEarNodeMessage) => void;
  readonly clock: Pick<Clock, 'now' | 'at'>;
  readonly log: Logger;
}

interface Running {
  readonly signature: string;
  readonly ear: Ear;
}

const round = (value: number): number => Math.round(value * 10) / 10;

export class RelayedEar {
  private config: ListeningConfig | null = null;
  private rest: RestReason | null = null;
  private running: Running | null = null;
  private chain: Promise<void> = Promise.resolve();
  private readonly grants = new GrantedClaims();
  private readonly decoder: PacketDecoder;
  private readonly fields: Readonly<Record<string, string>>;

  constructor(private readonly options: RelayedEarOptions) {
    this.decoder = packetDecoderFor(options.codec);
    this.fields = { source: options.source.kind, key: options.source.key };
  }

  receive(message: RemoteEarHubMessage): void {
    switch (message.kind) {
      case 'config':
        this.options.log.info('ear_host.config', {
          ...this.fields,
          wake: message.config.wake,
          transcribe: message.config.transcribe,
          sensitivity: message.config.sensitivity,
          keywords: message.config.keywords.length,
        });
        this.config = message.config;
        this.rest = null;
        this.queue();
        return;
      case 'rest':
        this.options.log.info('ear_host.rest', { ...this.fields, reason: message.reason });
        this.rest = message.reason;
        this.queue();
        return;
      case 'superseded':
        this.options.log.info('ear_host.superseded', {
          ...this.fields,
          winner: message.superseded.winner.source,
          winnerKey: message.superseded.winner.key,
        });
        return;
    }
  }

  hear(packet: Uint8Array): void {
    const running = this.running;
    if (running === null) {
      return;
    }
    try {
      running.ear.hear(this.decoder.decode(packet));
    } catch (cause) {
      this.options.log.error('ear_host.hear_failed', cause, {
        ...this.fields,
        consequence: 'this source is not listened to until the hub sends its config again',
      });
      this.config = null;
      this.queue();
    }
  }

  close(): Promise<void> {
    this.config = null;
    this.queue();
    return this.chain.then(() => {
      this.decoder.free();
    });
  }

  private queue(): void {
    this.chain = this.chain
      .then(() => this.reconcile())
      .catch((cause: unknown) => {
        this.options.log.error('ear_host.reconcile_failed', cause, {
          ...this.fields,
          reason: messageOf(cause),
          consequence: 'this source is not listened to until the hub sends its config again',
        });
      });
  }

  private wanted(): ListeningConfig | null {
    const config = this.config;
    return config !== null && this.rest === null && (config.wake || config.transcribe)
      ? config
      : null;
  }

  private async reconcile(): Promise<void> {
    const config = this.wanted();
    if (config === null) {
      await this.release();
      return;
    }
    const signature = JSON.stringify(config);
    if (this.running?.signature === signature) {
      return;
    }
    const next = await this.build(config, signature);
    const previous = this.running;
    this.running = next;
    await previous?.ear.close();
    this.options.log.info('ear_host.listening', {
      ...this.fields,
      wake: config.wake,
      transcribe: config.transcribe,
    });
  }

  private async build(config: ListeningConfig, signature: string): Promise<Running> {
    const { engine, clock, log, source } = this.options;
    const ear = new Ear(
      {
        claims: this.grants.claims,
        spotter: new RelayedSpotter(engine.spotter(), config),
        model: engine.model,
        names: (): readonly string[] => [],
        pauseMs: (): PauseChoiceMs => config.pause_ms,
        clock,
        log,
      },
      {
        claim: { source: source.kind, key: source.key },
        fields: this.fields,
        sensitivity: (): WakeSensitivity => config.sensitivity,
        resting: (): boolean => false,
        wakes: (): boolean => config.wake,
        wake: (phrase, words): void => {
          this.claimed(phrase, words());
        },
        near: (phrase): void => {
          this.options.send({ kind: 'near', phrase });
        },
        speech: config.transcribe
          ? (segment): void => {
              this.segment(segment);
            }
          : null,
      },
    );
    try {
      await ear.open();
    } catch (cause) {
      await ear.close();
      throw cause;
    }
    return { signature, ear };
  }

  private async release(): Promise<void> {
    const running = this.running;
    this.running = null;
    await running?.ear.close();
  }

  private claimed(phrase: string, words: Int16Array): void {
    this.options.log.info('ear_host.claimed', {
      ...this.fields,
      phrase,
      snippetDbfs: round(this.grants.level),
      prerollMs: Math.round(words.length / PREROLL_SAMPLES_PER_MS),
    });
    this.options.send({
      kind: 'claim',
      claim: { phrase, snippetDbfs: this.grants.level, preroll: encodePcm(words) },
    });
  }

  private segment(segment: SpeechSegment): void {
    this.options.log.info('ear_host.segment', {
      ...this.fields,
      durationMs: segment.endedAt - segment.startedAt,
    });
    this.options.send({ kind: 'segment', segment: listeningSegmentOf(segment) });
  }
}
