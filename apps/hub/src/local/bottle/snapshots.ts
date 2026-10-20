import {
  ACCELEROMETER,
  ADC_PROTECTION,
  CAPACITIVE_READING,
  HALL_READING,
  LOW_BATTERY_SETTINGS,
  QUIET_SETTINGS,
  REMINDER_SETTINGS,
  STATE_THRESHOLDS,
  TOF_SETTINGS,
  TOF_STATE,
  UI_STATE_READING,
  UV_CONFIG,
} from '@smarteverything/ble';
import {
  BOTTLE_CLASSIFIER_STATE,
  BOTTLE_DEVICE_INFORMATION,
  JSON_VALUE,
} from '@smarteverything/domain';
import { z } from 'zod';
import type { BottleLogsRepository } from '../../store/repositories/bottle-logs';

const AMBIENT = z.strictObject({ lux: z.number() });

const CALIBRATION_TIMEOUT = z.strictObject({ timeoutSeconds: z.number().int().nonnegative() });

const TIME_DRIFT = z.strictObject({ driftSeconds: z.number() });

export interface SnapshotSpec<T> {
  readonly kind: string;
  readonly schema: z.ZodType<T>;
}

function spec<T>(kind: string, schema: z.ZodType<T>): SnapshotSpec<T> {
  return { kind, schema };
}

export const SNAP = {
  dis: spec('dis', BOTTLE_DEVICE_INFORMATION),
  uiState: spec('ui_state', UI_STATE_READING),
  orientation: spec('orientation', ACCELEROMETER),
  ambient: spec('ambient', AMBIENT),
  hall: spec('hall', HALL_READING),
  sip: spec('sip', CAPACITIVE_READING),
  seated: spec('seated', CAPACITIVE_READING),
  tofSettings: spec('tof_settings', TOF_SETTINGS),
  tofState: spec('tof_state', TOF_STATE),
  lowBattery: spec('low_battery', LOW_BATTERY_SETTINGS),
  uvConfig: spec('uv_config', UV_CONFIG),
  thresholds: spec('thresholds', STATE_THRESHOLDS),
  protection: spec('protection', ADC_PROTECTION),
  calibrationTimeout: spec('calibration_timeout', CALIBRATION_TIMEOUT),
  reminder: spec('reminder', REMINDER_SETTINGS),
  quiet: spec('quiet', QUIET_SETTINGS),
  timeDrift: spec('time_drift', TIME_DRIFT),
  classifier: spec('classifier', BOTTLE_CLASSIFIER_STATE),
  logSync: spec('log_sync', z.record(z.string(), z.string())),
} as const;

export interface Snapshot<T> {
  readonly at: string;
  readonly value: T;
}

export class Snapshots {
  constructor(private readonly logs: Pick<BottleLogsRepository, 'snapshot' | 'saveSnapshot'>) {}

  get<T>(deviceId: string, which: SnapshotSpec<T>): Snapshot<T> | undefined {
    const stored = this.logs.snapshot(deviceId, which.kind);
    return stored === undefined
      ? undefined
      : { at: stored.at, value: which.schema.parse(stored.value) };
  }

  save<T>(deviceId: string, which: SnapshotSpec<T>, at: string, value: T): void {
    this.logs.saveSnapshot(deviceId, which.kind, at, JSON_VALUE.parse(which.schema.parse(value)));
  }
}
