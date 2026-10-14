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
import { ListeningBudget } from './listening-budget';
import { ownerProfileOf } from './owner';
import type { Transcriber } from './transcriber';
import type { Transcripts } from './transcript-service';

const PENDING_LIMIT = 4;
const CONTEXT_LINES = 3;
const CONTEXT_WINDOW_MS = 120_000;
const SAMPLES_PER_MS = 16;

export interface CameraListeningOptions {
  readonly store: Pick<
    Store,
    'cameras' | 'devices' | 'transcripts' | 'clients' | 'profiles' | 'settings'
  >;
  readonly transcripts: Transcripts;
  readonly transcriber: Pick<Transcriber, 'transcribe'>;
  readonly ready: (cameraId: string) => Promise<void>;
  readonly keyPresent: () => boolean;
  readonly inConversation: (cameraId: string) => boolean;
  readonly names: () => readonly string[];
  readonly clock: Pick<Clock, 'now'>;
  readonly log: Logger;
}

interface Open {
  readonly sessionId: string;
  readonly day: string;
}

export class CameraListening {
  private readonly open = new Map<string, Open>();
  private readonly pending = new Map<string, number>();
  private readonly chains = new Map<string, Promise<void>>();
  private readonly paused = new Map<string, TranscriptPauseReason>();
  private readonly budget: ListeningBudget;

  constructor(private readonly options: CameraListeningOptions) {
    this.budget = new ListeningBudget(options);
  }

  segment(cameraId: string, segment: SpeechSegment): void {
    const waiting = this.pending.get(cameraId) ?? 0;
    if (waiting >= PENDING_LIMIT) {
      this.options.log.warn('transcripts.segment_dropped', { cameraId, waiting });
      return;
    }
    this.pending.set(cameraId, waiting + 1);
    const chain = (this.chains.get(cameraId) ?? Promise.resolve())
      .then(() => this.handle(cameraId, segment))
      .catch((cause: unknown) => {
        this.options.log.error('transcripts.segment_failed', cause, { cameraId });
      })
      .finally(() => {
        this.pending.set(cameraId, (this.pending.get(cameraId) ?? 1) - 1);
      });
    this.chains.set(cameraId, chain);
  }

  async status(): Promise<TranscriptStatus> {
    const cameras = await Promise.all(
      this.options.store.cameras.list().map((camera) => this.listeningOf(camera)),
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
    if (text === null) {
      return;
    }
    const session = this.sessionOf(cameraId);
    this.options.transcripts.add(session.id, {
      at: new Date(segment.startedAt).toISOString(),
      speaker_id: null,
      speaker: this.nameOf(cameraId),
      text,
      bot: false,
    });
    this.options.log.info('transcripts.heard', {
      cameraId,
      ms: Math.round(segment.pcm.length / SAMPLES_PER_MS),
      characters: text.length,
    });
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
