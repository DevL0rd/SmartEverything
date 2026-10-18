import type { Model } from '@ricky0123/vad-web/dist/models/common.js';
import type {
  ListeningConfig,
  ListeningHubMessage,
  ListeningNodeMessage,
  ListeningRuntimeState,
  PauseChoiceMs,
  WakeSensitivity,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import { messageOf } from '@smarteverything/logging';
import { sileroModel } from '../../assistant-voice/silero-vad';
import type { Cancel, Clock } from '../../clock';
import { Ear, type SpeechSegment } from '../../wake-name/ear';
import type { MicHandlers, StopMic } from '../controls/linux/mic-capture';
import { NodeFailureError } from '../node-failure';
import { ConfiguredSpotter } from './configured-spotter';
import { CallSpeaker, type EarSpeaker } from './call-speaker';
import { encodePcm, GrantedClaims, LevelMeter, listeningSegmentOf } from './ear-audio';

const RETRY_FIRST_MS = 5000;
const RETRY_LONGEST_MS = 120_000;
const FAILURES_BEFORE_REPORT = 2;
const PREROLL_SAMPLES_PER_MS = 16;
const CLAIMANT = { source: 'computer', key: 'node' } as const;
const FIELDS = { source: 'computer' } as const;

type RestReason = Extract<ListeningHubMessage, { readonly kind: 'rest' }>['reason'];

export interface EarCapture {
  readonly open: (handlers: MicHandlers) => Promise<StopMic>;
}

export interface DiscordWatch {
  readonly watch: (onChange: (held: boolean) => void) => () => void;
}

export interface EarPort {
  readonly receive: (message: ListeningHubMessage) => void;
  readonly stop: () => Promise<void>;
}

export type EarFactory = (send: (message: ListeningNodeMessage) => void) => EarPort;

export interface ComputerEarOptions {
  readonly capture: EarCapture;
  readonly speaker: EarSpeaker;
  readonly discord: DiscordWatch;
  readonly send: (message: ListeningNodeMessage) => void;
  readonly clock: Pick<Clock, 'now' | 'at'>;
  readonly log: Logger;
  readonly model?: () => Promise<Model>;
}

interface Running {
  readonly config: ListeningConfig;
  readonly ear: Ear;
  readonly spotter: ConfiguredSpotter;
}

const round = (value: number): number => Math.round(value * 10) / 10;

async function release(running: Running | null): Promise<void> {
  if (running !== null) {
    await running.ear.close();
    running.spotter.free();
  }
}

export class ComputerEar {
  private config: ListeningConfig | null = null;
  private rest: RestReason | null = null;
  private discordHeld = false;
  private stopDiscord: (() => void) | null = null;
  private running: Running | null = null;
  private stopMic: StopMic | null = null;
  private retry: Cancel | null = null;
  private delayMs = RETRY_FIRST_MS;
  private failures = 0;
  private missingTool = false;
  private watched = false;
  private inCall = false;
  private readonly speaker: CallSpeaker;
  private closed = false;
  private reported: ListeningRuntimeState | null = null;
  private readonly meter = new LevelMeter();
  private chain: Promise<void> = Promise.resolve();
  private readonly grants = new GrantedClaims();

  constructor(private readonly options: ComputerEarOptions) {
    this.speaker = new CallSpeaker(options.speaker, options.log);
  }

  receive(message: ListeningHubMessage): void {
    switch (message.kind) {
      case 'config':
        this.options.log.info('computer_ear.config', {
          wake: message.config.wake,
          transcribe: message.config.transcribe,
          sensitivity: message.config.sensitivity,
          keywords: message.config.keywords.length,
        });
        this.config = message.config;
        this.rest = null;
        this.missingTool = false;
        this.queue();
        return;
      case 'rest':
        this.options.log.info('computer_ear.rest', { reason: message.reason });
        this.rest = message.reason;
        this.queue();
        return;
      case 'superseded':
        this.options.log.info('computer_ear.superseded', {
          winner: message.superseded.winner.source,
          key: message.superseded.winner.key,
        });
        return;
      case 'level':
        this.watched = message.watched;
        return;
      case 'call':
        this.options.log.info('computer_ear.call', { active: message.active });
        this.inCall = message.active;
        if (message.active) {
          this.speaker.open();
        } else {
          this.speaker.close();
        }
        this.queue();
        return;
      case 'speak':
        this.speaker.write(message.pcm);
        return;
    }
  }

  stop(): Promise<void> {
    this.closed = true;
    this.config = null;
    this.inCall = false;
    this.speaker.close();
    this.queue();
    return this.chain;
  }

  private queue(): void {
    this.chain = this.chain
      .then(() => this.reconcile())
      .catch((cause: unknown) => {
        this.options.log.error('computer_ear.reconcile_failed', cause);
      });
  }

  private wanted(): boolean {
    const config = this.config;
    return config !== null && this.rest === null && (config.wake || config.transcribe);
  }

  private async reconcile(): Promise<void> {
    const wanted = this.wanted();
    this.watchDiscord(wanted);
    const config = this.config;
    if (this.inCall) {
      await this.releaseEar();
      await this.ensureMic();
    } else if (!wanted || config === null || this.discordHeld) {
      await this.halt();
    } else {
      await this.listen(config);
    }
    this.report();
  }

  private watchDiscord(wanted: boolean): void {
    if (wanted && this.stopDiscord === null) {
      this.stopDiscord = this.options.discord.watch((held) => {
        this.discordHeld = held;
        this.queue();
      });
    } else if (!wanted && this.stopDiscord !== null) {
      this.stopDiscord();
      this.stopDiscord = null;
      this.discordHeld = false;
    }
  }

  private async listen(config: ListeningConfig): Promise<void> {
    if (this.running?.config !== config) {
      await this.swap(config);
    }
    await this.ensureMic();
  }

  private async ensureMic(): Promise<void> {
    if (this.stopMic === null && this.retry === null && !this.missingTool) {
      await this.openMic();
    }
  }

  private async swap(config: ListeningConfig): Promise<void> {
    const next = await this.build(config);
    this.options.log.info('computer_ear.listening', {
      wake: config.wake,
      transcribe: config.transcribe,
    });
    const previous = this.running;
    this.running = next;
    await release(previous);
  }

  private async build(config: ListeningConfig): Promise<Running> {
    const spotter = new ConfiguredSpotter(config);
    const ear = new Ear(
      {
        claims: this.grants.claims,
        spotter,
        model: this.options.model ?? sileroModel,
        names: (): readonly string[] => [],
        pauseMs: (): PauseChoiceMs => config.pause_ms,
        clock: this.options.clock,
        log: this.options.log,
      },
      {
        claim: CLAIMANT,
        fields: FIELDS,
        sensitivity: (): WakeSensitivity => config.sensitivity,
        resting: (): boolean => false,
        wakes: (): boolean => config.wake,
        wake: (phrase, words): void => {
          this.claimed(phrase, words());
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
      spotter.free();
      throw cause;
    }
    return { config, ear, spotter };
  }

  private async openMic(): Promise<void> {
    try {
      this.stopMic = await this.options.capture.open({
        pcm: (chunk) => {
          this.hear(chunk);
        },
        ended: (reason) => {
          this.captureEnded(reason);
        },
      });
    } catch (cause) {
      this.missingTool = cause instanceof NodeFailureError;
      this.options.log.warn('computer_ear.capture_unavailable', {
        reason: messageOf(cause),
        consequence: 'this computer cannot hear the wake word until the tool is installed',
      });
      if (!this.missingTool) {
        throw cause;
      }
    }
  }

  private captureEnded(reason: string): void {
    this.stopMic = null;
    this.failures += 1;
    const retryInMs = this.delayMs;
    this.delayMs = Math.min(this.delayMs * 2, RETRY_LONGEST_MS);
    this.options.log.warn('computer_ear.capture_ended', {
      reason,
      failures: this.failures,
      retryInMs,
    });
    this.retry = this.options.clock.at(new Date(this.now() + retryInMs), () => {
      this.retry = null;
      this.queue();
    });
    this.report();
  }

  private hear(chunk: Int16Array): void {
    if (this.failures > 0) {
      this.failures = 0;
      this.delayMs = RETRY_FIRST_MS;
      this.report();
    }
    if (this.inCall) {
      this.options.send({ kind: 'mic', pcm: encodePcm(chunk) });
      return;
    }
    try {
      this.running?.ear.hear(chunk);
    } catch (cause) {
      this.options.log.error('computer_ear.hear_failed', cause);
      this.config = null;
      this.queue();
      return;
    }
    if (this.watched) {
      const level = this.meter.feed(chunk);
      if (level !== null) {
        this.options.send({ kind: 'level', dbfs: level });
      }
    }
  }

  private claimed(phrase: string, words: Int16Array): void {
    this.options.log.info('computer_ear.claimed', {
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
    this.options.log.info('computer_ear.segment', {
      durationMs: segment.endedAt - segment.startedAt,
    });
    this.options.send({ kind: 'segment', segment: listeningSegmentOf(segment) });
  }

  private async halt(): Promise<void> {
    this.retry?.();
    this.retry = null;
    this.stopMic?.();
    this.stopMic = null;
    await this.releaseEar();
  }

  private async releaseEar(): Promise<void> {
    const running = this.running;
    this.running = null;
    await release(running);
  }

  private state(): ListeningRuntimeState | null {
    if (!this.wanted()) {
      return null;
    }
    if (this.discordHeld) {
      return 'discord_call';
    }
    return this.missingTool || this.failures >= FAILURES_BEFORE_REPORT ? 'needs_permission' : null;
  }

  private report(): void {
    const state = this.state();
    if (state !== this.reported && !this.closed) {
      this.reported = state;
      this.options.log.info('computer_ear.state', { state });
      this.options.send({ kind: 'state', state });
    }
  }

  private now(): number {
    return this.options.clock.now().getTime();
  }
}
