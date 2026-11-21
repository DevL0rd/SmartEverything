import {
  QUIET_HOURS,
  insideClockWindow,
  isCamera,
  localClock,
  type QuietHours,
  type ReachSettings,
  type ReachSettingsChange,
} from '@smarteverything/domain';
import { z } from 'zod';
import type { MirroredSavedKey } from '../store/home-mirror';
import type { Store } from '../store/store';

const BLOCKED_KEY: MirroredSavedKey = 'reach.blocked_cameras';

const STORED_BLOCKED = z.strictObject({ blocked: z.array(z.uuid()) });

const WAKE_OFF_KEY: MirroredSavedKey = 'reach.wake_off';

const STORED_CAMERA_LIST = z.strictObject({ cameras: z.array(z.uuid()) });

const STANDBY_OFF_KEY: MirroredSavedKey = 'reach.speaker_standby_off';

const QUIET_KEY: MirroredSavedKey = 'reach.quiet';

const STORED_QUIET = z.strictObject({ people: z.record(z.uuid(), QUIET_HOURS) });

type StoredQuiet = z.infer<typeof STORED_QUIET>;

export type ReachRulesStore = Pick<Store, 'live'>;

export function insideQuiet(quiet: QuietHours, minute: number): boolean {
  return insideClockWindow(quiet, minute);
}

export class ReachRules {
  private readonly listeners = new Set<() => void>();

  constructor(
    private readonly store: ReachRulesStore,
    private readonly now: () => Date,
  ) {}

  settings(profileId: string): ReachSettings {
    return {
      quiet: this.quiet(profileId),
      cameras: [...this.cameras()],
      wakeOff: [...this.wakeOff()],
    };
  }

  async save(profileId: string, change: ReachSettingsChange): Promise<ReachSettings> {
    const { saved } = this.store.live.home;
    const writes: Promise<void>[] = [];
    if (change.quiet !== undefined) {
      const { [profileId]: _previous, ...others } = this.storedQuiet().people;
      const people = change.quiet === null ? others : { ...others, [profileId]: change.quiet };
      writes.push(saved.save(QUIET_KEY, { people }));
    }
    if (change.cameras !== undefined) {
      const allowed = new Set(change.cameras);
      const blocked = this.allCameras().filter((id) => !allowed.has(id));
      writes.push(saved.save(BLOCKED_KEY, { blocked }));
    }
    if (change.wakeOff !== undefined) {
      writes.push(saved.save(WAKE_OFF_KEY, { cameras: [...new Set(change.wakeOff)] }));
    }
    await Promise.all(writes);
    if (change.cameras !== undefined || change.wakeOff !== undefined) {
      this.listeners.forEach((listener) => {
        listener();
      });
    }
    return this.settings(profileId);
  }

  onCamerasChanged(listener: () => void): () => void {
    this.listeners.add(listener);
    return (): void => {
      this.listeners.delete(listener);
    };
  }

  wakeOff(): readonly string[] {
    const stored = this.store.live.home.saved.read(WAKE_OFF_KEY);
    return stored === null ? [] : STORED_CAMERA_LIST.parse(stored).cameras;
  }

  standbyOff(): readonly string[] {
    const stored = this.store.live.home.saved.read(STANDBY_OFF_KEY);
    return stored === null ? [] : STORED_CAMERA_LIST.parse(stored).cameras;
  }

  quiet(profileId: string): QuietHours | null {
    return this.storedQuiet().people[profileId] ?? null;
  }

  private storedQuiet(): StoredQuiet {
    const stored = this.store.live.home.saved.read(QUIET_KEY);
    return stored === null ? { people: {} } : STORED_QUIET.parse(stored);
  }

  cameras(): readonly string[] {
    const stored = this.store.live.home.saved.read(BLOCKED_KEY);
    const blocked = new Set(stored === null ? [] : STORED_BLOCKED.parse(stored).blocked);
    return this.allCameras().filter((id) => !blocked.has(id));
  }

  private allCameras(): string[] {
    return this.store.live.home.devices
      .list()
      .filter((device) => isCamera(device))
      .map((device) => device.id);
  }

  quietNow(profileId: string): boolean {
    const quiet = this.quiet(profileId);
    if (quiet === null) {
      return false;
    }
    const zone = this.store.live.home.settings.read().time_zone;
    return insideQuiet(quiet, localClock(this.now(), zone).minuteOfDay);
  }

  quietRefusal(profileId: string, name: string, urgent: boolean): string | null {
    if (!this.quietNow(profileId)) {
      return null;
    }
    const quiet = this.quiet(profileId);
    if (urgent && quiet?.urgent === true) {
      return null;
    }
    const until = quiet === null ? '' : ` until ${quiet.to}`;
    return urgent
      ? `${name} has quiet hours${until} and doesn’t let urgent calls through.`
      : `${name} has quiet hours${until}; only urgent calls get through, if they allow them.`;
  }
}
