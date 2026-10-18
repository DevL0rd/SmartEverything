import {
  MICROS_PER_USD,
  type TranscriptListening,
  type TranscriptPauseReason,
  type TranscriptSession,
  type TranscriptStatus,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import {
  CameraOfflineError,
  CameraPrivacyError,
  UnknownStreamError,
} from '../cameras/camera-service';
import type { Clock } from '../clock';
import type { Store } from '../store/store';
import type { SpeechSegment } from '../wake-name/ear';
import { sameWords, silenceHallucination } from './heard-text';
import { dbfsOfPcm } from './line-levels';
import { ListeningBudget } from './listening-budget';
import { ownerProfileOf } from './owner';
import type { Transcriber } from './transcriber';
import type { Transcripts } from './transcript-service';
import { Utterances } from './utterances';

const CONTEXT_LINES = 3;
const CONTEXT_WINDOW_MS = 120_000;
const SAMPLES_PER_MS = 16;
const REPEAT_WINDOW_MS = 30_000;

export interface CameraListeningOptions {
  readonly store: Pick<
    Store,
    'cameras' | 'devices' | 'transcripts' | 'clients' | 'profiles' | 'personAccess' | 'settings'
  >;
  readonly transcripts: Transcripts;
  readonly transcriber: Pick<Transcriber, 'transcribe'>;
  readonly ready: (cameraId: string) => Promise<void>;
  readonly keyPresent: () => boolean;
  readonly inConversation: (cameraId: string) => boolean;
  readonly names: () => readonly string[];
  readonly clock: Pick<Clock, 'now' | 'at'>;
  readonly log: Logger;
}

interface Said {
  readonly text: string;
  readonly at: number;
}

interface Open {
  readonly sessionId: string;
  readonly day: string;
}

export class CameraListening {
  private readonly open = new Map<string, Open>();
  private readonly chains = new Map<string, Promise<void>>();
  private readonly paused = new Map<string, TranscriptPauseReason>();
  private readonly utterances = new Map<string, Utterances>();
  private readonly said = new Map<string, Said>();
  private readonly budget: ListeningBudget;

  constructor(private readonly options: CameraListeningOptions) {
    this.budget = new ListeningBudget(options);
  }

  segment(cameraId: string, segment: SpeechSegment): void {
    this.utterancesOf(cameraId).add(segment);
  }

  private utterancesOf(cameraId: string): Utterances {
    let utterances = this.utterances.get(cameraId);
    if (utterances === undefined) {
      utterances = new Utterances(this.options.clock, {
        heard: (utterance): void => {
          this.queue(cameraId, utterance);
        },
        skipped: (reason, ms): void => {
          this.options.log.debug('transcripts.utterance_skipped', {
            cameraId,
            reason,
            ms: Math.round(ms),
          });
        },
      });
      this.utterances.set(cameraId, utterances);
    }
    return utterances;
  }

  private queue(cameraId: string, segment: SpeechSegment): void {
    const chain = (this.chains.get(cameraId) ?? Promise.resolve())
      .then(() => this.handle(cameraId, segment))
      .catch((cause: unknown) => {
        this.options.log.error('transcripts.segment_failed', cause, { cameraId });
      });
    this.chains.set(cameraId, chain);
  }

  async status(cameraIds?: readonly string[]): Promise<TranscriptStatus> {
    const cameras = await Promise.all(
      this.options.store.cameras
        .list()
        .filter((camera) => cameraIds === undefined || cameraIds.includes(camera.device_id))
        .map((camera) => this.listeningOf(camera)),
    );
    return {
      cameras,
      spent_usd: this.budget.spentToday() / MICROS_PER_USD,
      cap_usd: this.options.transcripts.settings().daily_cap_usd,
    };
  }

  private async listeningOf(camera: {
    readonly device_id: string;
    readonly transcribe: boolean;
  }): Promise<TranscriptListening> {
    const cameraId = camera.device_id;
    if (!camera.transcribe) {
      return { camera_id: cameraId, state: 'off' };
    }
    const reason = await this.pauseOf(cameraId);
    return reason === null
      ? { camera_id: cameraId, state: 'listening' }
      : { camera_id: cameraId, state: 'paused', reason };
  }

  private async pauseOf(cameraId: string): Promise<TranscriptPauseReason | null> {
    if (!this.options.keyPresent()) {
      return 'no_openrouter_key';
    }
    if (this.budget.capReached()) {
      return 'cap_reached';
    }
    if (this.options.inConversation(cameraId)) {
      return 'in_call';
    }
    return this.options.ready(cameraId).then(
      () => null,
      (cause: unknown) => {
        if (cause instanceof CameraPrivacyError) {
          return 'privacy';
        }
        if (cause instanceof CameraOfflineError || cause instanceof UnknownStreamError) {
          return 'offline';
        }
        throw cause;
      },
    );
  }

  private async handle(cameraId: string, segment: SpeechSegment): Promise<void> {
    const reason = await this.pauseOf(cameraId);
    this.noteReason(cameraId, reason);
    if (reason !== null) {
      return;
    }
    const { store } = this.options;
    const profileId = ownerProfileOf(store);
    const text = await this.options.transcriber.transcribe({
      pcm16k: segment.pcm,
      profileId,
      pluginId: null,
      names: this.options.names(),
      recent: this.recentLines(cameraId),
      meta: { listening: 'camera', camera_id: cameraId },
    });
    if (text === null || this.unheard(cameraId, text, segment.startedAt)) {
      return;
    }
    const session = this.sessionOf(cameraId);
    this.options.transcripts.add(
      session.id,
      {
        at: new Date(segment.startedAt).toISOString(),
        ended_at: new Date(segment.endedAt).toISOString(),
        timing: 'wall_clock',
        speaker_id: null,
        speaker: this.nameOf(cameraId),
        text,
        bot: false,
      },
      dbfsOfPcm(segment.pcm),
    );
    this.options.log.info('transcripts.heard', {
      cameraId,
      ms: Math.round(segment.pcm.length / SAMPLES_PER_MS),
      characters: text.length,
    });
  }

  private unheard(cameraId: string, text: string, at: number): boolean {
    const before = this.said.get(cameraId);
    this.said.set(cameraId, { text, at });
    const repeated =
      before !== undefined && at - before.at < REPEAT_WINDOW_MS && sameWords(before.text, text);
    const reason = silenceHallucination(text) ? 'hallucination' : repeated ? 'repeat' : null;
    if (reason !== null) {
      this.options.log.debug('transcripts.line_dropped', { cameraId, reason });
    }
    return reason !== null;
  }

  private noteReason(cameraId: string, reason: TranscriptPauseReason | null): void {
    const before = this.paused.get(cameraId) ?? null;
    if (before === reason) {
      return;
    }
    if (reason === null) {
      this.paused.delete(cameraId);
      this.options.log.info('transcripts.listening_resumed', { cameraId });
    } else {
      this.paused.set(cameraId, reason);
      this.options.log.info('transcripts.listening_paused', { cameraId, reason });
    }
  }

  private recentLines(cameraId: string): string[] {
    const open = this.open.get(cameraId);
    if (open === undefined || this.options.transcripts.find(open.sessionId) === undefined) {
      return [];
    }
    return this.options.transcripts
      .recent(open.sessionId, CONTEXT_WINDOW_MS, CONTEXT_LINES)
      .map((line) => line.text);
  }

  private sessionOf(cameraId: string): TranscriptSession {
    const day = this.dayOf();
    const held = this.open.get(cameraId);
    const session = held === undefined ? undefined : this.options.transcripts.find(held.sessionId);
    if (held?.day === day && session?.ended_at === null) {
      return session;
    }
    if (session !== undefined) {
      this.options.transcripts.close(session.id);
    }
    const opened = this.options.transcripts.open({
      source: 'camera',
      sourceId: cameraId,
      pluginId: null,
      title: `${this.nameOf(cameraId)} · ${day}`,
      retentionDays: null,
    });
    this.open.set(cameraId, { sessionId: opened.id, day });
    return opened;
  }

  private nameOf(cameraId: string): string {
    const device = this.options.store.devices.find(cameraId);
    return device === undefined ? 'Camera' : (device.display_name ?? device.name);
  }

  private dayOf(): string {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: this.options.store.settings.read().time_zone,
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    }).format(this.options.clock.now());
  }
}
