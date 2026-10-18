import {
  JSON_VALUE,
  presentDevice,
  withRole,
  type CapabilityRole,
  type DeviceRow,
  type JsonValue,
  type PresentedCapability,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import { z } from 'zod';
import type { NewCommand } from '../store/repositories/commands';
import type { SettingsKvRepository } from '../store/repositories/settings-kv';
import type { StateRepository } from '../store/repositories/state';

const FRAMING_KEY = 'reach.framing';

const SETTING = z.strictObject({ capability: z.string().min(1), value: JSON_VALUE });

const SNAPSHOT = z.strictObject({ deviceId: z.uuid(), before: z.array(SETTING) });

const STORED = z.strictObject({ calls: z.record(z.uuid(), SNAPSHOT) });

export type FramingSnapshot = z.infer<typeof SNAPSHOT>;

type Stored = z.infer<typeof STORED>;

type Setting = z.infer<typeof SETTING>;

const FRAMING_ROLES: readonly CapabilityRole[] = [
  'detect_people',
  'follow_people',
  'smart_zoom',
  'zoom',
  'ptz_preset',
];

const ENABLED_ROLES: Readonly<Partial<Record<CapabilityRole, true>>> = {
  detect_people: true,
  follow_people: true,
  smart_zoom: true,
};

const ZOOM_IN_SHARE = 0.15;

interface FramingStore {
  readonly settingsKv: Pick<SettingsKvRepository, 'read' | 'save'>;
  readonly state: Pick<StateRepository, 'ofDevice'>;
}

export type FramedCamera = Pick<DeviceRow, 'id' | 'kind' | 'model' | 'capabilities'>;

export interface FramingOptions {
  readonly store: FramingStore;
  readonly submit: (commands: readonly NewCommand[]) => void;
  readonly log: Logger;
}

function command(deviceId: string, setting: Setting): NewCommand {
  return {
    deviceId,
    capability: setting.capability,
    value: setting.value,
    source: 'assistant',
    requestedBy: null,
  };
}

function wanted(presented: PresentedCapability, current: JsonValue): JsonValue {
  const descriptor = presented.capability.value;
  if (presented.role === 'ptz_preset') {
    return current;
  }
  if (presented.role !== 'zoom') {
    return true;
  }
  if (descriptor.kind !== 'number' || typeof current !== 'number') {
    return current;
  }
  const zoomed = descriptor.min + (descriptor.max - descriptor.min) * ZOOM_IN_SHARE;
  const stepped = Math.round(zoomed / descriptor.step) * descriptor.step;
  return Math.max(current, stepped);
}

function isEnabled(role: CapabilityRole | null): boolean {
  return role !== null && ENABLED_ROLES[role] === true;
}

function differ(left: JsonValue | undefined, right: JsonValue): boolean {
  return JSON.stringify(left) !== JSON.stringify(right);
}

function text(settings: readonly Setting[]): string {
  return settings
    .map((setting) => `${setting.capability}=${JSON.stringify(setting.value)}`)
    .join(',');
}

export class CameraFraming {
  constructor(private readonly options: FramingOptions) {}

  begin(outreachId: string, device: FramedCamera): void {
    const presentation = presentDevice(device);
    const values = this.valuesOf(device.id);
    const found = FRAMING_ROLES.flatMap((role) => {
      const presented = withRole(presentation, role);
      const value = presented === undefined ? undefined : values.get(presented.key);
      return presented?.writable === true && value !== undefined ? [{ presented, value }] : [];
    });
    if (!found.some((entry) => isEnabled(entry.presented.role))) {
      this.options.log.info('reach.camera_framing_unavailable', { deviceId: device.id });
      return;
    }
    const earlier = this.snapshotsOf(device.id)[0];
    const before =
      earlier?.before ??
      found.map((entry) => ({ capability: entry.presented.key, value: entry.value }));
    this.save(outreachId, { deviceId: device.id, before });
    if (earlier !== undefined) {
      this.apply('shared', device.id, before, []);
      return;
    }
    const set = found
      .map((entry) => ({
        capability: entry.presented.key,
        value: wanted(entry.presented, entry.value),
      }))
      .filter((setting) => differ(values.get(setting.capability), setting.value));
    this.apply('on', device.id, before, set);
  }

  restore(outreachId: string): void {
    const snapshot = this.stored().calls[outreachId];
    if (snapshot === undefined) {
      return;
    }
    const others = Object.entries(this.stored().calls).filter(
      ([id, entry]) => id !== outreachId && entry.deviceId === snapshot.deviceId,
    );
    if (others.length > 0) {
      this.forget(outreachId);
      this.apply('kept', snapshot.deviceId, snapshot.before, []);
      return;
    }
    this.restoreDevice(snapshot.deviceId);
  }

  restoreAll(): void {
    new Set(Object.values(this.stored().calls).map((snapshot) => snapshot.deviceId)).forEach(
      (deviceId) => {
        this.restoreDevice(deviceId);
      },
    );
  }

  private restoreDevice(deviceId: string): void {
    const snapshot = this.snapshotsOf(deviceId)[0];
    if (snapshot === undefined) {
      return;
    }
    this.apply('restore', deviceId, snapshot.before, snapshot.before);
    const { calls } = this.stored();
    this.options.store.settingsKv.save(FRAMING_KEY, {
      calls: Object.fromEntries(
        Object.entries(calls).filter(([, entry]) => entry.deviceId !== deviceId),
      ),
    });
  }

  private forget(outreachId: string): void {
    const { calls } = this.stored();
    this.options.store.settingsKv.save(FRAMING_KEY, {
      calls: Object.fromEntries(Object.entries(calls).filter(([id]) => id !== outreachId)),
    });
  }

  private snapshotsOf(deviceId: string): FramingSnapshot[] {
    return Object.values(this.stored().calls).filter((entry) => entry.deviceId === deviceId);
  }

  private apply(
    step: 'on' | 'shared' | 'kept' | 'restore',
    deviceId: string,
    read: readonly Setting[],
    set: readonly Setting[],
  ): void {
    if (set.length > 0) {
      this.options.submit(set.map((setting) => command(deviceId, setting)));
    }
    this.options.log.info('reach.camera_framing', {
      deviceId,
      step,
      read: text(read),
      set: text(set),
    });
  }

  private save(outreachId: string, snapshot: FramingSnapshot): void {
    const stored = this.stored();
    this.options.store.settingsKv.save(FRAMING_KEY, {
      calls: { ...stored.calls, [outreachId]: snapshot },
    });
  }

  private stored(): Stored {
    const raw = this.options.store.settingsKv.read(FRAMING_KEY);
    return raw === null ? { calls: {} } : STORED.parse(raw);
  }

  private valuesOf(deviceId: string): ReadonlyMap<string, JsonValue> {
    return new Map(
      this.options.store.state.ofDevice(deviceId).map((row) => [row.capability, row.value]),
    );
  }
}
