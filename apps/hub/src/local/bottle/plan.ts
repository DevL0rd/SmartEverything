import {
  bytesToHex,
  readRequest,
  setQuietRequest,
  setReminderRequest,
  uvRequest,
  type ReadRequestName,
} from '@smarteverything/ble';
import {
  BOTTLE_CLOCK_SLACK_MS,
  BOTTLE_LOGS,
  bottleChannelsOfHex,
  secondsOfBottleClock,
  type BottleLog,
  type BottlePlanStep,
  type BottlePushAction,
  type BottleQuiet,
  type BottleQuietChange,
  type BottleReminder,
  type BottleReminderChange,
  type BottleSyncPlan,
  type BottleUvStart,
} from '@smarteverything/domain';
import type { BottleLogsRepository } from '../../store/repositories/bottle-logs';
import type { BottleReadingsRepository } from '../../store/repositories/bottle-readings';
import type { LocalDeviceEntry } from '../../store/repositories/local-devices';
import { entryConfigOf, type BottleEntryConfig } from './config';
import { quietOfCap, reminderOfCap } from './convert';
import { SNAP, type Snapshots } from './snapshots';

export const REQUEST_STEPS = {
  ui_state: 'RequestGetCapUiState',
  time: 'RequestGetCapTimeSettings',
  tof_state: 'RequestGetCapTofState',
  tof_settings: 'RequestGetCapTofSettings',
  accelerometer: 'RequestGetCapAccelerometerState',
  ambient: 'RequestGetCapAmbientLightSensorState',
  hall: 'RequestGetCapHallEffectSensorState',
  sip: 'RequestGetCapSipSensorState',
  seated: 'RequestGetCapBottleSensorState',
  reminder: 'RequestGetCapHydroReminderSettings',
  quiet: 'RequestGetCapDoNotDisturbSettings',
  low_battery: 'RequestGetCapLowBatterySettings',
  uv_config: 'RequestGetCapUvConfig',
  thresholds: 'RequestGetCapStateThresholdSettings',
  protection: 'RequestGetCapAdcProtectionSettings',
  calibration_timeout: 'RequestGetCapCalibrationSettings',
} as const satisfies Record<string, ReadRequestName>;

export type RequestStepName = keyof typeof REQUEST_STEPS;

export const WRITE_STEPS = ['set_reminder', 'set_quiet', 'uv'] as const;

export const LOG_STEPS: Readonly<Record<BottleLog, string>> = {
  tof: 'log_tof',
  activation: 'log_activation',
  state: 'log_state',
  fault: 'log_fault',
  activation_adc: 'log_activation_adc',
  charging_adc: 'log_charging_adc',
};

const LOG_LIMITS: Readonly<Record<BottleLog, number>> = {
  tof: 5,
  activation: 6,
  state: 4,
  fault: 8,
  activation_adc: 4,
  charging_adc: 4,
};

const DAILY_LOGS: ReadonlySet<BottleLog> = new Set(['state', 'activation_adc', 'charging_adc']);

const SETTINGS_STEPS: readonly RequestStepName[] = [
  'tof_settings',
  'low_battery',
  'uv_config',
  'thresholds',
  'protection',
  'calibration_timeout',
];

export const STALE_MS = 24 * 60 * 60_000;

const DEVICE_INFORMATION_MS = 7 * STALE_MS;

const MS_PER_SECOND = 1000;

const GATE_TOLERANCE_G = 0.15;

const DEFAULT_REMINDER: BottleReminder = {
  state: 'interval_fixed',
  intervalMin: 30,
  from: '08:00',
  to: '21:00',
  colour: '#ffffff',
};

const DEFAULT_QUIET: BottleQuiet = {
  state: 'off',
  from: '22:00',
  to: '07:00',
  snoozeMin: 0,
};

export interface PlanDeps {
  readonly readings: Pick<BottleReadingsRepository, 'newestAt'>;
  readonly logs: Pick<
    BottleLogsRepository,
    'newestUvAt' | 'newestFaultAt' | 'newestStateAt' | 'newestAdcAt'
  >;
  readonly snapshots: Pick<Snapshots, 'get'>;
  readonly now: () => Date;
}

class Steps {
  private readonly list: BottlePlanStep[] = [];

  constructor(private readonly unsupported: ReadonlySet<string>) {}

  get steps(): BottlePlanStep[] {
    return this.list;
  }

  read(name: RequestStepName): void {
    if (this.unsupported.has(name)) {
      return;
    }
    this.list.push({
      kind: 'request',
      name,
      requestHex: bytesToHex(readRequest(this.list.length + 1, REQUEST_STEPS[name])),
      gate: null,
    });
  }

  gated(name: RequestStepName): void {
    this.list.push({
      kind: 'request',
      name,
      requestHex: bytesToHex(readRequest(this.list.length + 1, REQUEST_STEPS[name])),
      gate: { kind: 'upright_still', toleranceG: GATE_TOLERANCE_G },
    });
  }

  write(name: (typeof WRITE_STEPS)[number], build: (id: number) => Uint8Array): void {
    this.list.push({
      kind: 'request',
      name,
      requestHex: bytesToHex(build(this.list.length + 1)),
      gate: null,
    });
  }

  log(log: BottleLog, fromTimestamp: number): void {
    if (this.unsupported.has(LOG_STEPS[log])) {
      return;
    }
    this.list.push({
      kind: 'log',
      name: LOG_STEPS[log],
      log,
      fromTimestamp,
      limit: LOG_LIMITS[log],
    });
  }

  gatt(name: 'battery' | 'device_information'): void {
    this.list.push({ kind: 'gatt_read', name, what: name });
  }

  setTime(): void {
    this.list.push({ kind: 'set_time', name: 'set_time' });
  }
}

function reminderWriteOf(reminder: BottleReminder): Parameters<typeof setReminderRequest>[1] {
  return {
    state: reminder.state === 'off' ? 'off' : 'interval_fixed',
    startSeconds: secondsOfBottleClock(reminder.from),
    stopSeconds: secondsOfBottleClock(reminder.to),
    intervalSeconds: reminder.intervalMin * 60,
    colour: bottleChannelsOfHex(reminder.colour),
  };
}

export function mergedReminder(base: BottleReminder, change: BottleReminderChange): BottleReminder {
  return {
    state: change.state ?? base.state,
    intervalMin: change.intervalMin ?? base.intervalMin,
    from: change.from ?? base.from,
    to: change.to ?? base.to,
    colour: change.colour ?? base.colour,
  };
}

export function mergedQuiet(base: BottleQuiet, change: BottleQuietChange): BottleQuiet {
  return {
    state: change.state ?? base.state,
    from: change.from ?? base.from,
    to: change.to ?? base.to,
    snoozeMin: base.snoozeMin,
  };
}

function quietWriteOf(
  quiet: BottleQuiet,
  reminder: BottleReminder,
): Parameters<typeof setQuietRequest>[1] {
  const window = quiet.state === 'auto' ? { from: reminder.to, to: reminder.from } : quiet;
  return {
    state: quiet.state === 'on' || quiet.state === 'auto' ? quiet.state : 'off',
    startSeconds: secondsOfBottleClock(window.from),
    stopSeconds: secondsOfBottleClock(window.to),
    snoozeMinutes: quiet.snoozeMin,
  };
}

export function currentReminder(
  deps: Pick<PlanDeps, 'snapshots'>,
  deviceId: string,
): BottleReminder {
  const read = deps.snapshots.get(deviceId, SNAP.reminder);
  return read === undefined ? DEFAULT_REMINDER : reminderOfCap(read.value);
}

export function currentQuiet(deps: Pick<PlanDeps, 'snapshots'>, deviceId: string): BottleQuiet {
  const read = deps.snapshots.get(deviceId, SNAP.quiet);
  return read === undefined ? DEFAULT_QUIET : quietOfCap(read.value);
}

function pendingWrites(
  steps: Steps,
  deps: PlanDeps,
  deviceId: string,
  config: BottleEntryConfig,
): void {
  const { reminder: reminderChange, quiet: quietChange } = config.desired;
  const base = currentReminder(deps, deviceId);
  const reminder = reminderChange === null ? base : mergedReminder(base, reminderChange);
  const quietBase = currentQuiet(deps, deviceId);
  if (reminderChange !== null) {
    steps.write('set_reminder', (id) => setReminderRequest(id, reminderWriteOf(reminder)));
    steps.read('reminder');
  }
  if (quietChange !== null || (reminderChange !== null && quietBase.state === 'auto')) {
    const quiet = quietChange === null ? quietBase : mergedQuiet(quietBase, quietChange);
    steps.write('set_quiet', (id) => setQuietRequest(id, quietWriteOf(quiet, reminder)));
    steps.read('quiet');
  }
}

function settingsAgeMs(deps: PlanDeps, deviceId: string): number {
  const stamps = [
    deps.snapshots.get(deviceId, SNAP.reminder)?.at,
    deps.snapshots.get(deviceId, SNAP.quiet)?.at,
    deps.snapshots.get(deviceId, SNAP.tofSettings)?.at,
  ];
  const oldest = stamps.reduce<number>(
    (least, at) => Math.min(least, at === undefined ? 0 : Date.parse(at)),
    Number.POSITIVE_INFINITY,
  );
  return deps.now().getTime() - oldest;
}

const CURSORS: Readonly<
  Record<BottleLog, (deps: PlanDeps, deviceId: string, notAfter: number) => number | null>
> = {
  tof: (deps, deviceId, notAfter) => deps.readings.newestAt(deviceId, notAfter),
  activation: (deps, deviceId, notAfter) => deps.logs.newestUvAt(deviceId, notAfter),
  fault: (deps, deviceId, notAfter) => deps.logs.newestFaultAt(deviceId, notAfter),
  state: (deps, deviceId, notAfter) => deps.logs.newestStateAt(deviceId, notAfter),
  activation_adc: (deps, deviceId, notAfter) =>
    deps.logs.newestAdcAt(deviceId, 'activation', notAfter),
  charging_adc: (deps, deviceId, notAfter) => deps.logs.newestAdcAt(deviceId, 'charging', notAfter),
};

function logCursor(deps: PlanDeps, deviceId: string, log: BottleLog, notAfter: number): number {
  return CURSORS[log](deps, deviceId, notAfter) ?? 0;
}

function dueLogs(deps: PlanDeps, deviceId: string): readonly BottleLog[] {
  const synced = deps.snapshots.get(deviceId, SNAP.logSync)?.value ?? {};
  const now = deps.now().getTime();
  return BOTTLE_LOGS.filter((log) => {
    const last = synced[log];
    return !DAILY_LOGS.has(log) || last === undefined || now - Date.parse(last) > STALE_MS;
  });
}

interface PlanTarget {
  readonly entry: LocalDeviceEntry;
  readonly deviceId: string;
}

export function syncPlanOf(deps: PlanDeps, target: PlanTarget): BottleSyncPlan {
  const { entry, deviceId } = target;
  const config = entryConfigOf(entry);
  const steps = new Steps(new Set(config.unsupported.requests));
  const now = deps.now().getTime();
  const information = deps.snapshots.get(deviceId, SNAP.dis);
  if (information === undefined || now - Date.parse(information.at) > DEVICE_INFORMATION_MS) {
    steps.gatt('device_information');
  }
  steps.gatt('battery');
  steps.read('time');
  steps.setTime();
  steps.read('ui_state');
  pendingWrites(steps, deps, deviceId, config);
  if (settingsAgeMs(deps, deviceId) > STALE_MS) {
    steps.read('reminder');
    steps.read('quiet');
    SETTINGS_STEPS.forEach((name) => {
      steps.read(name);
    });
  }
  const notAfter = Math.floor((now + BOTTLE_CLOCK_SLACK_MS) / MS_PER_SECOND);
  dueLogs(deps, deviceId).forEach((log) => {
    steps.log(log, logCursor(deps, deviceId, log, notAfter));
  });
  return { serial: entry.address, steps: steps.steps };
}

export function actionPlanOf(
  deps: PlanDeps,
  target: PlanTarget,
  action: BottlePushAction,
  uvMode: BottleUvStart | null,
): BottleSyncPlan {
  const { entry, deviceId } = target;
  const steps = new Steps(new Set());
  switch (action) {
    case 'sync_now':
      return syncPlanOf(deps, target);
    case 'measure': {
      steps.gated('accelerometer');
      steps.read('tof_state');
      const notAfter = Math.floor((deps.now().getTime() + BOTTLE_CLOCK_SLACK_MS) / MS_PER_SECOND);
      steps.log('tof', logCursor(deps, deviceId, 'tof', notAfter));
      break;
    }
    case 'read_sensors':
      (['ambient', 'hall', 'sip', 'seated'] as const).forEach((name) => {
        steps.read(name);
      });
      break;
    case 'read_orientation':
      steps.read('accelerometer');
      break;
    case 'uv_stop':
      steps.write('uv', (id) => uvRequest(id, 'stop'));
      steps.read('ui_state');
      break;
    case 'uv_start':
      steps.write('uv', (id) => uvRequest(id, uvMode ?? 'normal'));
      steps.read('ui_state');
      break;
  }
  return { serial: entry.address, steps: steps.steps };
}
