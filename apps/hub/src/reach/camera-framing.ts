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
import type { Clock } from '../clock';
import type { NewCommand } from '../store/repositories/commands';
import type { AiChatsRepository } from '../store/repositories/ai-chats';
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
];

const ZOOM_IN_SHARE = 0.15;

export const READ_BACK_MS = 3000;

export interface FramingStore {
  readonly aiChats: Pick<AiChatsRepository, 'setting' | 'saveSetting'>;
  readonly state: Pick<StateRepository, 'list'>;
}

export type FramedCamera = Pick<DeviceRow, 'id' | 'kind' | 'model' | 'capabilities'>;

export interface FramingOptions {
  readonly store: FramingStore;
  readonly submit: (commands: readonly NewCommand[]) => void;
  readonly clock: Pick<Clock, 'now' | 'at'>;
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
    if (!found.some((entry) => entry.presented.role !== 'zoom')) {
      this.options.log.info('reach.camera_framing_unavailable', { deviceId: device.id });
      return;
    }
    const before = found.map((entry) => ({ capability: entry.presented.key, value: entry.value }));
    const set = found
      .map((entry) => ({
        capability: entry.presented.key,
        value: wanted(entry.presented, entry.value),
      }))
      .filter((setting) => differ(values.get(setting.capability), setting.value));
    this.save(outreachId, { deviceId: device.id, before });
    this.apply('on', device.id, before, set);
  }

  restore(outreachId: string): void {
    const stored = this.stored();
    const snapshot = stored.calls[outreachId];
    if (snapshot === undefined) {
      return;
    }
    const values = this.valuesOf(snapshot.deviceId);
    const set = snapshot.before.filter((setting) =>
      differ(values.get(setting.capability), setting.value),
    );
    const { [outreachId]: _restored, ...rest } = stored.calls;
    this.options.store.aiChats.saveSetting(FRAMING_KEY, { calls: rest });
    this.apply('restore', snapshot.deviceId, snapshot.before, set);
  }

  restoreAll(): void {
    Object.keys(this.stored().calls).forEach((outreachId) => {
      this.restore(outreachId);
    });
  }

  private apply(
    step: 'on' | 'restore',
    deviceId: string,
    read: readonly Setting[],
    set: readonly Setting[],
  ): void {
    this.options.submit(set.map((setting) => command(deviceId, setting)));
    this.options.log.info('reach.camera_framing', {
      deviceId,
      step,
      read: text(read),
      set: text(set),
    });
    const due = new Date(this.options.clock.now().getTime() + READ_BACK_MS);
    this.options.clock.at(due, () => {
      const after = this.valuesOf(deviceId);
      const reported = read.map((setting) => ({
        capability: setting.capability,
        value: after.get(setting.capability) ?? null,
      }));
      const missed = set.filter((setting) => differ(after.get(setting.capability), setting.value));
      this.options.log.info('reach.camera_framing_read_back', {
        deviceId,
        step,
        after: text(reported),
        notApplied: text(missed),
      });
    });
  }

  private save(outreachId: string, snapshot: FramingSnapshot): void {
    const stored = this.stored();
    this.options.store.aiChats.saveSetting(FRAMING_KEY, {
      calls: { ...stored.calls, [outreachId]: snapshot },
    });
  }

  private stored(): Stored {
    const raw = this.options.store.aiChats.setting(FRAMING_KEY);
    return raw === null ? { calls: {} } : STORED.parse(raw);
  }

  private valuesOf(deviceId: string): ReadonlyMap<string, JsonValue> {
    return new Map(
      this.options.store.state
        .list()
        .filter((row) => row.device_id === deviceId)
        .map((row) => [row.capability, row.value]),
    );
  }
}
