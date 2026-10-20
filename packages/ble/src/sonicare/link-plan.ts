import {
  type BrushStep,
  type BrushTransport,
  type LINK_READ,
  type LINK_SUBSCRIPTION,
  type SonicareProfile,
} from '@smarteverything/domain';
import type { z } from 'zod';
import { bytesToHex } from '../bytes';
import { SENSOR_PORT, STATE_PORTS, getPropsFrame, putPropsFrame, subscribeFrame } from './condor';
import { RECORD_CANCEL, RECORD_ROUTINE_KIND, RECORD_START } from './records';
import { KEY, classicServiceOf, fullOf } from './uuids';

type Subscription = z.infer<typeof LINK_SUBSCRIPTION>;

type Read = z.infer<typeof LINK_READ>;

export interface BrushLinkPlanParts {
  readonly transport: BrushTransport;
  readonly brand: 'sonicare';
  readonly adverts: null;
  readonly sync: readonly Read[];
  readonly subscriptions: readonly Subscription[];
  readonly reads: readonly Read[];
  readonly prepare: readonly BrushStep[];
  readonly initial: readonly BrushStep[];
}

const SONICARE_PLAN_FACTS = { brand: 'sonicare', adverts: null, sync: [] } as const;

const INDICATED: ReadonlySet<string> = new Set([KEY.handleState, KEY.mode]);

const ALWAYS_NOTIFY = [
  KEY.battery,
  KEY.handleState,
  KEY.sessionId,
  KEY.mode,
  KEY.brushingState,
  KEY.elapsed,
  KEY.routineLength,
  KEY.pacer,
  KEY.intensity,
  KEY.easyStart,
  KEY.latestStored,
  KEY.storedCount,
] as const;

const TRANSFER_NOTIFY = [KEY.fetchSession, KEY.recordData, KEY.recordControl] as const;

const HEAD_NOTIFY = [KEY.headSerial, KEY.headUsage] as const;

const DEVICE_READS = [KEY.model, KEY.serial, KEY.firmware, KEY.manufacturer, KEY.pnp] as const;

const LIVE_READS = [
  KEY.battery,
  KEY.handleState,
  KEY.routineIds,
  KEY.motorRuntime,
  KEY.handleClock,
  KEY.sessionId,
  KEY.mode,
  KEY.brushingState,
  KEY.elapsed,
  KEY.routineLength,
  KEY.intensity,
  KEY.easyStart,
  KEY.latestStored,
  KEY.storedCount,
  KEY.settings,
] as const;

const HEAD_READS = [
  KEY.headNfcVersion,
  KEY.headType,
  KEY.headSerial,
  KEY.headMade,
  KEY.headLimit,
  KEY.headUsage,
  KEY.headUrl,
  KEY.headRing,
] as const;

const DIAGNOSTIC_READS = [
  KEY.errorPersistent,
  KEY.errorVolatile,
  KEY.calibrationWords,
  KEY.batteryMillivolts,
  KEY.calibrationText,
] as const;

function placeOf(key: string, kids: boolean): { service: string; characteristic: string } {
  const service = classicServiceOf(key, kids);
  if (service === null) {
    throw new UnknownKeyError(key);
  }
  return { service, characteristic: fullOf(key) };
}

class UnknownKeyError extends Error {
  override readonly name = 'UnknownKeyError';

  constructor(key: string) {
    super(`The Sonicare characteristic ${key} has no known service.`);
  }
}

function writeStep(key: string, kids: boolean, bytes: Uint8Array): BrushStep {
  return {
    kind: 'write',
    ...placeOf(key, kids),
    hex: bytesToHex(bytes),
    writeType: 'with_response',
  };
}

function uint16Bytes(value: number): Uint8Array {
  return new Uint8Array([value & 0xff, (value >> 8) & 0xff]);
}

function uint32Bytes(value: number): Uint8Array {
  return new Uint8Array([
    value & 0xff,
    (value >>> 8) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 24) & 0xff,
  ]);
}

function classicPlan(
  profile: SonicareProfile,
  sensorMask: number,
  cancelFirst: boolean,
): BrushLinkPlanParts {
  const kids = profile.family === 'kids';
  const notify = [
    ...ALWAYS_NOTIFY,
    ...(profile.head === 'none' ? [] : HEAD_NOTIFY),
    ...(profile.history === 'retained' && !kids ? TRANSFER_NOTIFY : []),
    ...(sensorMask > 0 ? [KEY.sensorData] : []),
  ];
  const reads = [
    ...DEVICE_READS,
    ...LIVE_READS,
    ...(profile.head === 'none' ? [] : HEAD_READS),
    ...DIAGNOSTIC_READS,
  ];
  return {
    ...SONICARE_PLAN_FACTS,
    transport: 'gatt',
    subscriptions: notify.map((key) => ({
      ...placeOf(key, kids),
      mode: INDICATED.has(key) ? 'indicate' : 'notify',
    })),
    reads: reads.map((key) => placeOf(key, kids)),
    prepare: sensorMask > 0 ? [writeStep(KEY.sensorEnable, kids, uint16Bytes(sensorMask))] : [],
    initial: cancelFirst
      ? [writeStep(KEY.recordControl, kids, new Uint8Array([RECORD_CANCEL]))]
      : [],
  };
}

function condorFrame(frame: Uint8Array): BrushStep {
  return { kind: 'condor_frame', hex: bytesToHex(frame) };
}

function condorPlan(sensorMask: number): BrushLinkPlanParts {
  const states = STATE_PORTS.filter((port) => port !== 'SensorData');
  const sensors =
    sensorMask > 0
      ? [
          condorFrame(subscribeFrame(SENSOR_PORT)),
          condorFrame(putPropsFrame('SensorData', { Sensors: sensorMask })),
        ]
      : [];
  return {
    ...SONICARE_PLAN_FACTS,
    transport: 'condor',
    subscriptions: [],
    reads: DEVICE_READS.map((key) => placeOf(key, false)),
    prepare: [],
    initial: [
      ...states.map((port) => condorFrame(subscribeFrame(port))),
      ...STATE_PORTS.map((port) => condorFrame(getPropsFrame(port))),
      ...sensors,
    ],
  };
}

export function brushLinkPlanParts(
  profile: SonicareProfile,
  sensorMask: number,
  cancelFirst: boolean,
): BrushLinkPlanParts {
  return profile.stack === 'condor'
    ? condorPlan(sensorMask)
    : classicPlan(profile, sensorMask, cancelFirst);
}

export function sessionFetchSteps(profile: SonicareProfile, sessionId: number): BrushStep[] {
  const kids = profile.family === 'kids';
  const select = writeStep(KEY.fetchSession, kids, uint16Bytes(sessionId));
  if (kids) {
    return [select, { kind: 'read', ...placeOf(KEY.recordData, true) }];
  }
  return [
    writeStep(KEY.recordKind, false, new Uint8Array([RECORD_ROUTINE_KIND])),
    select,
    writeStep(KEY.recordControl, false, new Uint8Array([RECORD_START])),
  ];
}

export function readStep(profile: SonicareProfile, key: string): BrushStep {
  return { kind: 'read', ...placeOf(key, profile.family === 'kids') };
}

export function cancelTransferStep(profile: SonicareProfile): BrushStep {
  return writeStep(KEY.recordControl, profile.family === 'kids', new Uint8Array([RECORD_CANCEL]));
}

export function modeWriteStep(profile: SonicareProfile, routineId: number): BrushStep {
  return writeStep(KEY.routineIds, profile.family === 'kids', new Uint8Array([routineId]));
}

export function intensityWriteStep(profile: SonicareProfile, intensity: number): BrushStep {
  return writeStep(KEY.intensity, profile.family === 'kids', new Uint8Array([intensity]));
}

export function settingsWriteStep(profile: SonicareProfile, bits: number): BrushStep {
  return writeStep(KEY.settings, profile.family === 'kids', uint32Bytes(bits));
}

export function clockWriteStep(profile: SonicareProfile, unixSeconds: number): BrushStep {
  return writeStep(KEY.handleClock, profile.family === 'kids', uint32Bytes(unixSeconds));
}

export function sensorMaskWriteStep(profile: SonicareProfile, mask: number): BrushStep {
  return writeStep(KEY.sensorEnable, profile.family === 'kids', uint16Bytes(mask));
}
