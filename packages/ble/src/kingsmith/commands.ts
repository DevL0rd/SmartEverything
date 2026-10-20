import type {
  BeltMode,
  PadGoalKind,
  PadSensitivity,
  TreadmillFamily,
  TreadmillLinkPlan,
  TreadmillWriteStep,
} from '@smarteverything/domain';
import { UnsupportedCommandError } from './errors';
import {
  pauseMachine,
  requestControl,
  startOrResume,
  stopMachine,
  targetInclination,
  targetSpeed,
} from './ftms';
import { assertSendable } from './forbidden';
import {
  PROPERTY_IDS,
  SUPPLEMENT_SERVICE,
  SUPPLEMENT_WRITE,
  SWITCH_BITS,
  propertyWriteFrame,
} from './vendor';
import {
  goalFrame,
  pauseFrame,
  sensitivityFrame,
  setModeFrame,
  setSpeedFrame,
  speedLimitFrame,
  startFrame,
  toggleFrame,
} from './wilink';

export const WILINK_MODE_TO_START_MS = 1500;

export type ControlTarget = NonNullable<TreadmillLinkPlan['control']>;

export type BeltAction =
  | { readonly kind: 'start' | 'stop' | 'pause' | 'resume' }
  | { readonly kind: 'speed'; readonly kmh: number }
  | { readonly kind: 'incline'; readonly percent: number }
  | { readonly kind: 'mode'; readonly mode: BeltMode };

type PlainAction = Exclude<BeltAction, { readonly kind: 'incline' }>;

export type PadWrite =
  | { readonly key: 'goal'; readonly kind: PadGoalKind; readonly value: number }
  | { readonly key: 'max_speed' | 'start_speed'; readonly kmh: number }
  | { readonly key: 'auto_start' | 'child_lock'; readonly on: boolean }
  | { readonly key: 'buzzer' | 'light'; readonly on: boolean }
  | { readonly key: 'sensitivity'; readonly level: PadSensitivity };

const SUPPLEMENT_TARGET: ControlTarget = {
  service: SUPPLEMENT_SERVICE,
  characteristic: SUPPLEMENT_WRITE,
  writeType: 'without_response',
};

const SUPPLEMENT_SPEED_UNIT = 100;

export function stepOf(
  target: ControlTarget,
  bytes: Uint8Array,
  pauseAfterMs = 0,
): TreadmillWriteStep {
  assertSendable(bytes);
  return { ...target, hex: bytes.toHex(), pauseAfterMs };
}

function wilinkSteps(target: ControlTarget, action: PlainAction): TreadmillWriteStep[] {
  switch (action.kind) {
    case 'start':
      return [
        stepOf(target, setModeFrame('manual'), WILINK_MODE_TO_START_MS),
        stepOf(target, startFrame()),
      ];
    case 'stop':
      return [stepOf(target, setSpeedFrame(0))];
    case 'pause':
      return [stepOf(target, pauseFrame())];
    case 'resume':
      return [stepOf(target, startFrame())];
    case 'speed':
      return [stepOf(target, setSpeedFrame(action.kmh))];
    case 'mode':
      if (action.mode === 'auto' || action.mode === 'manual' || action.mode === 'standby') {
        return [stepOf(target, setModeFrame(action.mode))];
      }
      throw new UnsupportedCommandError(
        `Expected the mode auto, manual or standby for a WiLink belt, received ${action.mode}; HIIT, fat burn and walk are chosen on the treadmill panel.`,
      );
  }
}

function inclineSteps(
  family: TreadmillFamily,
  target: ControlTarget,
  percent: number,
): TreadmillWriteStep[] {
  if (family !== 'ftms' && family !== 'ftms_supplement') {
    throw new UnsupportedCommandError(
      `Expected a treadmill that sets its incline over standard Fitness Machine Bluetooth, received a ${family} treadmill.`,
    );
  }
  return [stepOf(target, requestControl()), stepOf(target, targetInclination(percent))];
}

function ftmsSteps(target: ControlTarget, action: PlainAction): TreadmillWriteStep[] {
  switch (action.kind) {
    case 'start':
    case 'resume':
      return [stepOf(target, startOrResume())];
    case 'stop':
      return [stepOf(target, stopMachine())];
    case 'pause':
      return [stepOf(target, pauseMachine())];
    case 'speed':
      return [stepOf(target, targetSpeed(action.kmh))];
    case 'mode':
      throw new UnsupportedCommandError(
        `Expected a belt command this treadmill takes over Bluetooth, received the mode ${action.mode}; its modes are chosen on the panel.`,
      );
  }
}

export function beltSteps(
  family: TreadmillFamily,
  target: ControlTarget,
  action: BeltAction,
): TreadmillWriteStep[] {
  if (action.kind === 'incline') {
    return inclineSteps(family, target, action.percent);
  }
  return family === 'wilink' ? wilinkSteps(target, action) : ftmsSteps(target, action);
}

type WilinkWrite = Exclude<PadWrite, { readonly key: 'buzzer' | 'light' }>;

function isWilinkWrite(write: PadWrite): write is WilinkWrite {
  return write.key !== 'buzzer' && write.key !== 'light';
}

function wilinkPadFrame(write: WilinkWrite): Uint8Array {
  switch (write.key) {
    case 'goal':
      return goalFrame(write.kind, write.value);
    case 'max_speed':
      return speedLimitFrame('maxSpeed', write.kmh);
    case 'start_speed':
      return speedLimitFrame('startSpeed', write.kmh);
    case 'auto_start':
      return toggleFrame('autoStart', write.on);
    case 'child_lock':
      return toggleFrame('childLock', write.on);
    case 'sensitivity':
      return sensitivityFrame(write.level);
  }
}

function switchValue(switches: number, bit: number, on: boolean): number {
  return on ? switches | bit : switches & ~bit;
}

function supplementPadFrame(write: PadWrite, switches: number): Uint8Array {
  if (write.key === 'child_lock') {
    return propertyWriteFrame(PROPERTY_IDS.childLock, write.on ? 1 : 0);
  }
  if (write.key === 'max_speed') {
    return propertyWriteFrame(PROPERTY_IDS.maxSpeed, Math.round(write.kmh * SUPPLEMENT_SPEED_UNIT));
  }
  if (write.key === 'buzzer') {
    return propertyWriteFrame(
      PROPERTY_IDS.switches,
      switchValue(switches, SWITCH_BITS.buzzer, write.on),
    );
  }
  if (write.key === 'light') {
    return propertyWriteFrame(
      PROPERTY_IDS.switches,
      switchValue(switches, SWITCH_BITS.light, write.on),
    );
  }
  throw new UnsupportedCommandError(
    `Expected child lock, maximum speed, buzzer or light for this treadmill, received ${write.key}.`,
  );
}

export function padSteps(
  family: TreadmillFamily,
  target: ControlTarget,
  write: PadWrite,
  switches: number,
): TreadmillWriteStep[] {
  if (family === 'wilink') {
    if (!isWilinkWrite(write)) {
      throw new UnsupportedCommandError(
        `Expected a setting a WiLink treadmill has, received ${write.key}; the buzzer and light exist on the supplement family only.`,
      );
    }
    return [stepOf(target, wilinkPadFrame(write))];
  }
  if (family === 'ftms_supplement') {
    return [stepOf(SUPPLEMENT_TARGET, supplementPadFrame(write, switches))];
  }
  throw new UnsupportedCommandError(
    `Expected a treadmill that stores settings on the belt, received a ${family} treadmill; its settings are changed on the panel.`,
  );
}
