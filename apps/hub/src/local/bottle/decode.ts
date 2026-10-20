import {
  LarqFrameError,
  LarqResponseError,
  decodeAccelerometer,
  decodeAdcProtection,
  decodeAmbientLight,
  decodeCalibrationSettings,
  decodeCapacitive,
  decodeHall,
  decodeLogPage,
  decodeLowBattery,
  decodeQuiet,
  decodeReminder,
  decodeResponse,
  decodeStateThresholds,
  decodeTimeSettings,
  decodeTofSettings,
  decodeTofState,
  decodeUiState,
  decodeUvConfig,
  hexToBytes,
  type LogRows,
} from '@smarteverything/ble';
import { BOTTLE_LOGS, type BottleLog, type BottleResponse } from '@smarteverything/domain';
import { ZodError } from 'zod';
import { LOG_STEPS, REQUEST_STEPS, WRITE_STEPS, type RequestStepName } from './plan';
import { SNAP, type SnapshotSpec, type Snapshots } from './snapshots';

export type Apply = (snapshots: Snapshots, deviceId: string) => void;

type Reader = (frame: Uint8Array, at: string) => Apply;

function reader<T>(spec: SnapshotSpec<T>, decode: (frame: Uint8Array) => T): Reader {
  return (frame, at) => {
    const value = decode(frame);
    return (snapshots, deviceId): void => {
      snapshots.save(deviceId, spec, at, value);
    };
  };
}

const MS_PER_SECOND = 1000;

const READERS: Readonly<Record<Exclude<RequestStepName, 'time'>, Reader>> = {
  ui_state: reader(SNAP.uiState, decodeUiState),
  tof_state: reader(SNAP.tofState, decodeTofState),
  tof_settings: reader(SNAP.tofSettings, decodeTofSettings),
  accelerometer: reader(SNAP.orientation, decodeAccelerometer),
  ambient: reader(SNAP.ambient, decodeAmbientLight),
  hall: reader(SNAP.hall, decodeHall),
  sip: reader(SNAP.sip, (frame) => decodeCapacitive(frame, 'RequestGetCapSipSensorState')),
  seated: reader(SNAP.seated, (frame) => decodeCapacitive(frame, 'RequestGetCapBottleSensorState')),
  reminder: reader(SNAP.reminder, decodeReminder),
  quiet: reader(SNAP.quiet, decodeQuiet),
  low_battery: reader(SNAP.lowBattery, decodeLowBattery),
  uv_config: reader(SNAP.uvConfig, decodeUvConfig),
  thresholds: reader(SNAP.thresholds, decodeStateThresholds),
  protection: reader(SNAP.protection, decodeAdcProtection),
  calibration_timeout: reader(SNAP.calibrationTimeout, decodeCalibrationSettings),
};

export interface Unreadable {
  readonly name: string;
  readonly reason: string;
}

export type LogPages = { readonly [L in BottleLog]: LogRows[L][] };

export interface Decoded {
  readonly applies: Apply[];
  readonly logs: LogPages;
  readonly acknowledged: Set<string>;
  readonly answered: Set<string>;
  readonly unsupported: string[];
  readonly unreadable: Unreadable[];
  readonly logsFetched: Set<BottleLog>;
}

const COLLECTORS: Readonly<Record<BottleLog, (pages: LogPages, frame: Uint8Array) => void>> = {
  tof: (pages, frame) => {
    pages.tof.push(...decodeLogPage(frame, 'tof'));
  },
  activation: (pages, frame) => {
    pages.activation.push(...decodeLogPage(frame, 'activation'));
  },
  state: (pages, frame) => {
    pages.state.push(...decodeLogPage(frame, 'state'));
  },
  fault: (pages, frame) => {
    pages.fault.push(...decodeLogPage(frame, 'fault'));
  },
  activation_adc: (pages, frame) => {
    pages.activation_adc.push(...decodeLogPage(frame, 'activation_adc'));
  },
  charging_adc: (pages, frame) => {
    pages.charging_adc.push(...decodeLogPage(frame, 'charging_adc'));
  },
};

function emptyLogs(): LogPages {
  return {
    tof: [],
    activation: [],
    state: [],
    fault: [],
    activation_adc: [],
    charging_adc: [],
  };
}

function requestStepOf(name: string): RequestStepName | undefined {
  return Object.keys(REQUEST_STEPS).find((step): step is RequestStepName => step === name);
}

function writeStepOf(name: string): boolean {
  return name === 'set_time' || WRITE_STEPS.some((step) => step === name);
}

function logOf(name: string): BottleLog | undefined {
  return BOTTLE_LOGS.find((log) => LOG_STEPS[log] === name);
}

function readOne(decoded: Decoded, response: BottleResponse, hex: string): void {
  const frame = hexToBytes(hex);
  const envelope = decodeResponse(frame);
  if (envelope.code === 'not_supported') {
    decoded.unsupported.push(response.name);
    return;
  }
  if (envelope.code === 'fail') {
    decoded.unreadable.push({ name: response.name, reason: 'the cap answered fail' });
    return;
  }
  decoded.answered.add(response.name);
  const step = requestStepOf(response.name);
  const log = logOf(response.name);
  if (step === 'time') {
    const { epochMilliseconds } = decodeTimeSettings(frame);
    const driftSeconds = (epochMilliseconds - Date.parse(response.at)) / MS_PER_SECOND;
    decoded.applies.push((snapshots, deviceId) => {
      snapshots.save(deviceId, SNAP.timeDrift, response.at, { driftSeconds });
    });
  } else if (step !== undefined) {
    decoded.applies.push(READERS[step](frame, response.at));
  } else if (log !== undefined) {
    COLLECTORS[log](decoded.logs, frame);
    decoded.logsFetched.add(log);
  } else if (writeStepOf(response.name)) {
    decoded.acknowledged.add(response.name);
  }
}

export function decodeResponses(responses: readonly BottleResponse[]): Decoded {
  const decoded: Decoded = {
    applies: [],
    logs: emptyLogs(),
    acknowledged: new Set(),
    answered: new Set(),
    unsupported: [],
    unreadable: [],
    logsFetched: new Set(),
  };
  for (const response of responses) {
    if (response.hex === null || response.timedOut) {
      continue;
    }
    try {
      readOne(decoded, response, response.hex);
    } catch (cause) {
      if (!(
        cause instanceof LarqFrameError ||
        cause instanceof LarqResponseError ||
        cause instanceof ZodError
      )) {
        throw cause;
      }
      decoded.unreadable.push({ name: response.name, reason: cause.message });
    }
  }
  return decoded;
}
