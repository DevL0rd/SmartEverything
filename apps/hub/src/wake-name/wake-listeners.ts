import {
  DEFAULT_WAKE_SENSITIVITY,
  OPEN_OUTREACH_STATES,
  type AiOutreachRow,
  type WakeSensitivity,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import { sileroModel } from '../assistant-voice/silero-vad';
import type { Clock } from '../clock';
import type { Store } from '../store/store';
import type { CameraMicrophones } from '../talk/camera-microphone';
import { CameraEar, type EarDeps } from './camera-ear';
import type { Ears, SpeechSegment } from './ear';
import type { WakeClaims } from './wake-claims';

export interface WakeRules {
  readonly cameras: () => readonly string[];
  readonly wakeOff: () => readonly string[];
}

export interface WakeListenersOptions {
  readonly store: Pick<Store, 'aiOutreach' | 'cameras' | 'devices' | 'feed'>;
  readonly rules: WakeRules;
  readonly microphones: Pick<CameraMicrophones, 'open'>;
  readonly ears: Pick<Ears, 'spotter'>;
  readonly claims: Pick<WakeClaims, 'request'>;
  readonly names: () => readonly string[];
  readonly wake: (cameraId: string, phrase: string, heard: () => Int16Array) => Promise<void>;
  readonly speech: (cameraId: string, segment: SpeechSegment) => void;
  readonly clock: Pick<Clock, 'now' | 'at'>;
  readonly log: Logger;
}

interface Listening {
  readonly wake: boolean;
  readonly speech: boolean;
}

interface Running {
  readonly ear: CameraEar;
  readonly listening: Listening;
}

function cameraOf(row: AiOutreachRow | null): string | null {
  return row !== null && row.how === 'camera' ? row.target : null;
}

export class WakeListeners {
  private readonly ears = new Map<string, Running>();
  private readonly busy = new Set<string>();
  private unsubscribe: (() => void) | null = null;

  constructor(private readonly options: WakeListenersOptions) {}

  start(): void {
    this.options.store.aiOutreach.open().forEach((row) => {
      this.track(row, null);
    });
    this.unsubscribe = this.options.store.feed.subscribe((change) => {
      if (change.table === 'ai_outreach') {
        this.track(change.record, change.oldRecord);
      } else if (
        change.table === 'cameras' ||
        (change.table === 'devices' && change.operation !== 'UPDATE')
      ) {
        this.sync();
      }
    });
    this.sync();
  }

  sync(): void {
    const wanted = this.wanted();
    [...this.ears.entries()]
      .filter(([id, running]) => !sameListening(wanted.get(id), running.listening))
      .forEach(([id, running]) => {
        this.ears.delete(id);
        void running.ear.close();
        this.options.log.info('wake.stopped', { cameraId: id });
      });
    [...wanted.entries()]
      .filter(([id]) => !this.ears.has(id))
      .forEach(([id, listening]) => {
        this.listen(id, listening);
      });
  }

  async stop(): Promise<void> {
    this.unsubscribe?.();
    const running = [...this.ears.values()];
    this.ears.clear();
    await Promise.all(running.map((one) => one.ear.close()));
  }

  private wanted(): Map<string, Listening> {
    const off = new Set(this.options.rules.wakeOff());
    const wake = new Set(
      this.options.rules.cameras().filter((id) => !off.has(id) && this.known(id)),
    );
    const speech = new Set(
      this.options.store.cameras
        .list()
        .filter((camera) => camera.transcribe && this.known(camera.device_id))
        .map((camera) => camera.device_id),
    );
    return new Map(
      [...new Set([...wake, ...speech])].map((id) => [
        id,
        { wake: wake.has(id), speech: speech.has(id) },
      ]),
    );
  }

  private known(cameraId: string): boolean {
    return this.options.store.devices.find(cameraId) !== undefined;
  }

  private listen(cameraId: string, listening: Listening): void {
    const deps: EarDeps = {
      claims: this.options.claims,
      microphones: this.options.microphones,
      spotter: this.options.ears.spotter(),
      model: sileroModel,
      names: this.options.names,
      sensitivity: (id): WakeSensitivity => this.sensitivity(id),
      busy: (id): boolean => this.busy.has(id),
      ...(listening.wake
        ? {
            heard: (id: string, phrase: string, heard: () => Int16Array): void => {
              this.heard(id, phrase, heard);
            },
          }
        : {}),
      ...(listening.speech ? { speech: this.options.speech } : {}),
      clock: this.options.clock,
      log: this.options.log,
    };
    const ear = new CameraEar(cameraId, deps);
    this.ears.set(cameraId, { ear, listening });
    this.options.log.info('wake.listening', { cameraId });
    ear.open().catch((cause: unknown) => {
      this.options.log.error('wake.start_failed', cause);
    });
  }

  private sensitivity(cameraId: string): WakeSensitivity {
    const row = this.options.store.cameras.find(cameraId);
    if (row === undefined) {
      this.options.log.error('wake.camera_row_missing', undefined, {
        cameraId,
        listeningAt: DEFAULT_WAKE_SENSITIVITY,
      });
      return DEFAULT_WAKE_SENSITIVITY;
    }
    return row.wake_sensitivity;
  }

  private heard(cameraId: string, phrase: string, heard: () => Int16Array): void {
    this.options.log.info('wake.heard', { cameraId, phrase });
    this.options.wake(cameraId, phrase, heard).catch((cause: unknown) => {
      this.options.log.warn('wake.conversation_refused', {
        cameraId,
        reason: cause instanceof Error ? cause.message : 'the conversation did not start',
      });
    });
  }

  private track(row: AiOutreachRow | null, before: AiOutreachRow | null): void {
    const cameraId = cameraOf(row ?? before);
    if (cameraId === null) {
      return;
    }
    if (row !== null && OPEN_OUTREACH_STATES.has(row.state)) {
      this.busy.add(cameraId);
    } else {
      this.busy.delete(cameraId);
    }
  }
}

function sameListening(wanted: Listening | undefined, running: Listening): boolean {
  return wanted?.wake === running.wake && wanted.speech === running.speech;
}
