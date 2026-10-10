import { OPEN_OUTREACH_STATES, type AiOutreachRow } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import { sileroModel } from '../assistant-voice/silero-vad';
import type { Clock } from '../clock';
import type { Store } from '../store/store';
import type { CameraMicrophones } from '../talk/camera-microphone';
import { CameraEar } from './camera-ear';
import { KeywordSpotter } from './keyword-spotter';

export interface WakeRules {
  readonly cameras: () => readonly string[];
  readonly wakeOff: () => readonly string[];
}

export interface WakeListenersOptions {
  readonly store: Pick<Store, 'aiOutreach' | 'devices' | 'feed'>;
  readonly rules: WakeRules;
  readonly microphones: Pick<CameraMicrophones, 'open'>;
  readonly names: () => readonly string[];
  readonly wake: (cameraId: string, phrase: string, heard: () => Int16Array) => Promise<void>;
  readonly clock: Pick<Clock, 'now' | 'at'>;
  readonly log: Logger;
}

function cameraOf(row: AiOutreachRow | null): string | null {
  return row !== null && row.how === 'camera' ? row.target : null;
}

export class WakeListeners {
  private readonly ears = new Map<string, CameraEar>();
  private readonly busy = new Set<string>();
  private spotter: KeywordSpotter | null = null;
  private unsubscribe: (() => void) | null = null;

  constructor(private readonly options: WakeListenersOptions) {}

  start(): void {
    this.options.store.aiOutreach.open().forEach((row) => {
      this.track(row, null);
    });
    this.unsubscribe = this.options.store.feed.subscribe((change) => {
      if (change.table === 'ai_outreach') {
        this.track(change.record, change.oldRecord);
      } else if (change.table === 'devices' && change.operation !== 'UPDATE') {
        this.sync();
      }
    });
    this.sync();
  }

  sync(): void {
    const wanted = new Set(this.wanted());
    [...this.ears.values()]
      .filter((ear) => !wanted.has(ear.cameraId))
      .forEach((ear) => {
        this.ears.delete(ear.cameraId);
        void ear.close();
        this.options.log.info('wake.stopped', { cameraId: ear.cameraId });
      });
    [...wanted]
      .filter((id) => !this.ears.has(id))
      .forEach((id) => {
        this.listen(id);
      });
  }

  async stop(): Promise<void> {
    this.unsubscribe?.();
    const ears = [...this.ears.values()];
    this.ears.clear();
    await Promise.all(ears.map((ear) => ear.close()));
    this.spotter?.free();
  }

  private wanted(): string[] {
    const off = new Set(this.options.rules.wakeOff());
    return this.options.rules
      .cameras()
      .filter((id) => !off.has(id) && this.options.store.devices.find(id) !== undefined);
  }

  private listen(cameraId: string): void {
    this.spotter ??= new KeywordSpotter();
    const ear = new CameraEar(cameraId, {
      microphones: this.options.microphones,
      spotter: this.spotter,
      model: sileroModel,
      names: this.options.names,
      busy: (id): boolean => this.busy.has(id),
      heard: (id, phrase, heard): void => {
        this.heard(id, phrase, heard);
      },
      clock: this.options.clock,
      log: this.options.log,
    });
    this.ears.set(cameraId, ear);
    this.options.log.info('wake.listening', { cameraId });
    ear.open().catch((cause: unknown) => {
      this.options.log.error('wake.start_failed', cause);
    });
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
