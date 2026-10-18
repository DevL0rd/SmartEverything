import {
  DEFAULT_LISTENING_POWER_MODE,
  DEFAULT_WAKE_SENSITIVITY,
  LISTENING_PHONE_STANDARD,
  LISTENING_POWER_MODE,
  LISTENING_STANDARD,
  WAKE_SENSITIVITY,
  type ListeningPowerMode,
  type ListeningSourceChange,
  type WakeSensitivity,
} from '@smarteverything/domain';
import { z } from 'zod';
import type { Store } from '../store/store';

const KEY = 'listening.devices';

const SWITCHES = z.strictObject({
  wake: z.boolean().optional(),
  transcribe: z.boolean().optional(),
  sensitivity: WAKE_SENSITIVITY.optional(),
  power_mode: LISTENING_POWER_MODE.optional(),
});

const STORED = z.strictObject({ devices: z.record(z.uuid(), SWITCHES) });

type Stored = z.infer<typeof STORED>;

export interface DeviceListening {
  readonly wake: boolean;
  readonly transcribe: boolean;
  readonly sensitivity: WakeSensitivity;
  readonly powerMode: ListeningPowerMode;
}

export class DeviceListeningSwitches {
  constructor(private readonly store: Pick<Store, 'settingsKv' | 'devices'>) {}

  read(deviceId: string): DeviceListening {
    const saved = this.stored().devices[deviceId];
    const standard = this.standardOf(deviceId);
    return {
      wake: saved?.wake ?? standard.wake,
      transcribe: saved?.transcribe ?? standard.transcribe,
      sensitivity: saved?.sensitivity ?? DEFAULT_WAKE_SENSITIVITY,
      powerMode: saved?.power_mode ?? DEFAULT_LISTENING_POWER_MODE,
    };
  }

  private standardOf(
    deviceId: string,
  ): typeof LISTENING_STANDARD | typeof LISTENING_PHONE_STANDARD {
    const device = this.store.devices.find(deviceId);
    return device?.kind === 'phone' ? LISTENING_PHONE_STANDARD : LISTENING_STANDARD;
  }

  save(deviceId: string, change: ListeningSourceChange): void {
    const current = this.read(deviceId);
    const next = {
      wake: change.wake ?? current.wake,
      transcribe: change.transcribe ?? current.transcribe,
      sensitivity: change.sensitivity ?? current.sensitivity,
      power_mode: change.power_mode ?? current.powerMode,
    };
    this.store.settingsKv.save(KEY, {
      devices: { ...this.stored().devices, [deviceId]: next },
    });
  }

  forget(deviceId: string): void {
    const { [deviceId]: removed, ...rest } = this.stored().devices;
    if (removed !== undefined) this.store.settingsKv.save(KEY, { devices: rest });
  }

  private stored(): Stored {
    const saved = this.store.settingsKv.read(KEY);
    return saved === null ? { devices: {} } : STORED.parse(saved);
  }
}
