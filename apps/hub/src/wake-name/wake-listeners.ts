import {
  OPEN_OUTREACH_STATES,
  isPrivate,
  privacySwitchOf,
  type AiOutreachRow,
  type PauseChoiceMs,
  type WakeSensitivity,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import { sileroModel } from '../assistant-voice/silero-vad';
import type { Clock } from '../clock';
import type { Store } from '../store/store';
import type { CameraMicrophones } from '../talk/camera-microphone';
import type { CameraSpeakers } from '../talk/camera-speaker';
import { CameraEar, type EarDeps } from './camera-ear';
import type { EndOfSpeechPause } from '../listening/end-of-speech-pause';
import type { Ears, SpeechSegment } from './ear';
import type { OnSuperseded, WakeClaims } from './wake-claims';
import type { WakeTest } from './wake-test';
import { background, messageOf } from '@smarteverything/logging';

interface WakeRules {
  readonly cameras: () => readonly string[];
  readonly wakeOff: () => readonly string[];
  readonly standbyOff: () => readonly string[];
}

export interface WakeListenersOptions {
  readonly store: Pick<Store, 'aiOutreach' | 'cameras' | 'devices' | 'feed' | 'state'>;
  readonly rules: WakeRules;
  readonly microphones: Pick<CameraMicrophones, 'open'>;
  readonly speakers: Pick<CameraSpeakers, 'standby'>;
  readonly ears: Pick<Ears, 'spotter' | 'diagnostics'> & {
    readonly pause: Pick<EndOfSpeechPause, 'ms'>;
  };
  readonly claims: Pick<WakeClaims, 'request'>;
  readonly test: Pick<WakeTest, 'active' | 'onActive' | 'matched'>;
  readonly names: () => readonly string[];
  readonly wake: (
    cameraId: string,
    phrase: string,
    heard: () => Int16Array,
    onSuperseded: OnSuperseded,
  ) => Promise<void>;
  readonly speech: (cameraId: string, segment: SpeechSegment) => void;
  readonly clock: Pick<Clock, 'now' | 'at'>;
  readonly log: Logger;
}

interface Listening {
  readonly wake: boolean;
  readonly speech: boolean;
  readonly standby: boolean;
}

interface Running {
  readonly ear: CameraEar;
  readonly listening: Listening;
  readonly release: () => void;
}

function cameraOf(row: AiOutreachRow | null): string | null {
  return row !== null && row.how === 'camera' ? row.target : null;
}

export class WakeListeners {
  private readonly ears = new Map<string, Running>();
  private readonly busy = new Set<string>();
  private unsubscribe: (() => void) | null = null;
  private unwatchTest: (() => void) | null = null;

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
      } else if (change.table === 'devices') {
        this.syncIfConcerning(change.record?.id);
      } else if (change.table === 'device_state') {
        this.syncIfConcerning(change.record?.device_id);
      }
    });
    this.unwatchTest = this.options.test.onActive(() => {
      this.sync();
    });
    this.sync();
  }

  sync(): void {
    const wanted = this.wanted();
    [...this.ears.entries()]
      .filter(([id, running]) => !sameListening(wanted.get(id), running.listening))
      .forEach(([id, running]) => {
        this.ears.delete(id);
        running.release();
        background(running.ear.close(), 'ear.close_failed');
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
    this.unwatchTest?.();
    const running = [...this.ears.values()];
    this.ears.clear();
    running.forEach((one) => {
      one.release();
    });
    await Promise.all(running.map((one) => one.ear.close()));
  }

  private wanted(): Map<string, Listening> {
    const off = new Set(this.options.rules.wakeOff());
    const standbyOff = new Set(this.options.rules.standbyOff());
    const wake = new Set(
      this.options.rules.cameras().filter((id) => !off.has(id) && this.known(id)),
    );
    const speech = new Set([
      ...this.options.store.cameras
        .list()
        .filter((camera) => camera.transcribe && this.known(camera.device_id))
        .map((camera) => camera.device_id),
      ...(this.options.test.active() ? wake : []),
    ]);
    return new Map(
      [...new Set([...wake, ...speech])].map((id) => [
        id,
        {
          wake: wake.has(id),
          speech: speech.has(id),
          standby: wake.has(id) && !standbyOff.has(id),
        },
      ]),
    );
  }

  private known(cameraId: string): boolean {
    const device = this.options.store.devices.find(cameraId);
    if (device?.online !== true) {
      return false;
    }
    const privacy = privacySwitchOf(device);
    return (
      privacy === null || !isPrivate(privacy, this.options.store.state.value(cameraId, privacy.key))
    );
  }

  private syncIfConcerning(deviceId: string | undefined): void {
    if (deviceId !== undefined && this.concerns(deviceId)) {
      this.sync();
    }
  }

  private concerns(deviceId: string): boolean {
    return (
      this.ears.has(deviceId) ||
      this.options.rules.cameras().includes(deviceId) ||
      this.options.store.cameras.find(deviceId) !== undefined
    );
  }

  private listen(cameraId: string, listening: Listening): void {
    const deps: EarDeps = {
      claims: this.options.claims,
      microphones: this.options.microphones,
      spotter: this.options.ears.spotter(),
      diagnostics: this.options.ears.diagnostics,
      model: sileroModel,
      names: this.options.names,
      pauseMs: (): PauseChoiceMs => this.options.ears.pause.ms(),
      sensitivity: (id): WakeSensitivity => this.sensitivity(id),
      busy: (id): boolean => this.busy.has(id),
      ...(listening.wake
        ? {
            heard: (
              id: string,
              phrase: string,
              heard: () => Int16Array,
              onSuperseded: OnSuperseded,
            ): void => {
              this.options.test.matched({ kind: 'camera', key: id }, phrase);
              this.heard(id, phrase, heard, onSuperseded);
            },
          }
        : {}),
      ...(listening.speech ? { speech: this.options.speech } : {}),
      clock: this.options.clock,
      log: this.options.log,
    };
    const ear = new CameraEar(cameraId, deps);
    const release = listening.standby
      ? this.options.speakers.standby(cameraId)
      : (): void => undefined;
    this.ears.set(cameraId, { ear, listening, release });
    this.options.log.info('wake.listening', { cameraId });
    ear.open().catch((cause: unknown) => {
      this.options.log.error('wake.start_failed', cause);
    });
  }

  private sensitivity(cameraId: string): WakeSensitivity {
    return this.options.store.cameras.byDevice(cameraId).wake_sensitivity;
  }

  private heard(
    cameraId: string,
    phrase: string,
    heard: () => Int16Array,
    onSuperseded: OnSuperseded,
  ): void {
    const heardAt = this.options.clock.now().getTime();
    this.options.log.info('wake.heard', { cameraId, phrase });
    this.options.wake(cameraId, phrase, heard, onSuperseded).then(
      () => {
        this.options.log.info('wake.call_started', {
          cameraId,
          sinceHeardMs: this.options.clock.now().getTime() - heardAt,
        });
      },
      (cause: unknown) => {
        this.options.log.warn('wake.conversation_refused', {
          cameraId,
          reason: messageOf(cause),
        });
      },
    );
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
  return (
    wanted?.wake === running.wake &&
    wanted.speech === running.speech &&
    wanted.standby === running.standby
  );
}
