import type {
  TreadmillFamily,
  TreadmillGattDump,
  TreadmillLinkPlan,
  TreadmillWriteStep,
} from '@smarteverything/domain';
import {
  FTMS_CONTROL_POINT,
  FTMS_MACHINE_STATUS,
  FTMS_SERVICE,
  FTMS_TRAINING_STATUS,
  FTMS_TREADMILL_DATA,
  requestControl,
} from './ftms';
import { stepOf, type ControlTarget } from './commands';
import {
  ODM_CHARACTERISTIC,
  ODM_PREAMBLE,
  SUPPLEMENT_NOTIFY,
  SUPPLEMENT_SERVICE,
  SUPPLEMENT_WRITE,
  functionInfoFrame,
  settingGetFrame,
  systemInfoFrame,
  unlockFrame,
} from './vendor';
import {
  WILINK_NOTIFY,
  WILINK_SERVICE,
  WILINK_WRITE,
  queryPreferencesFrame,
  statusRequest,
} from './wilink';

export type LinkPlanParts = Omit<
  TreadmillLinkPlan,
  'deviceId' | 'address' | 'autoConnect' | 'presence' | 'holder'
>;

const CCCD_PACING_MS = 100;

const WILINK_WRITE_PACING_MS = 150;

const FTMS_WRITE_PACING_MS = 100;

const VENDOR_WRITE_PACING_MS = 400;

const STATUS_EVERY_MS = 1000;

const STATUS_SETTLE_REQUESTS = 5;

const WILINK_STATE_BYTE = 2;

const WILINK_ACTIVE_STATES = [1, 2, 6, 7, 8, 9];

type Subscription = TreadmillLinkPlan['subscriptions'][number];

function hasCharacteristic(dump: TreadmillGattDump, service: string, uuid: string): boolean {
  return (
    dump.services
      .find((candidate) => candidate.uuid === service)
      ?.characteristics.some((characteristic) => characteristic.uuid === uuid) === true
  );
}

function subscription(
  service: string,
  characteristic: string,
  mode: Subscription['mode'],
  delivery: Pick<Subscription, 'coalescePrefix' | 'changeByte'>,
): Subscription {
  return { service, characteristic, mode, ...delivery };
}

function ftmsSubscriptions(dump: TreadmillGattDump): Subscription[] {
  const immediate = { coalescePrefix: null, changeByte: null };
  const wanted: readonly Subscription[] = [
    subscription(FTMS_SERVICE, FTMS_TREADMILL_DATA, 'notify', {
      coalescePrefix: '',
      changeByte: null,
    }),
    subscription(FTMS_SERVICE, FTMS_MACHINE_STATUS, 'notify', immediate),
    subscription(FTMS_SERVICE, FTMS_CONTROL_POINT, 'indicate', immediate),
    subscription(FTMS_SERVICE, FTMS_TRAINING_STATUS, 'notify', immediate),
  ];
  return wanted.filter((entry) => hasCharacteristic(dump, entry.service, entry.characteristic));
}

function wilinkPlan(): LinkPlanParts {
  const target: ControlTarget = {
    service: WILINK_SERVICE,
    characteristic: WILINK_WRITE,
    writeType: 'without_response',
  };
  return {
    family: 'wilink',
    subscriptions: [
      subscription(WILINK_SERVICE, WILINK_NOTIFY, 'notify', {
        coalescePrefix: 'f8a2',
        changeByte: WILINK_STATE_BYTE,
      }),
    ],
    control: target,
    preamble: null,
    cccdPacingMs: CCCD_PACING_MS,
    writePacingMs: WILINK_WRITE_PACING_MS,
    initial: [stepOf(target, queryPreferencesFrame()), stepOf(target, statusRequest())],
    statusRequest: {
      hex: statusRequest().toHex(),
      everyMs: STATUS_EVERY_MS,
      stateByte: WILINK_STATE_BYTE,
      activeValues: WILINK_ACTIVE_STATES,
      settleRequests: STATUS_SETTLE_REQUESTS,
    },
  };
}

function ftmsTarget(): ControlTarget {
  return { service: FTMS_SERVICE, characteristic: FTMS_CONTROL_POINT, writeType: 'with_response' };
}

function supplementInitial(name: string, now: Date): TreadmillWriteStep[] {
  const target: ControlTarget = {
    service: SUPPLEMENT_SERVICE,
    characteristic: SUPPLEMENT_WRITE,
    writeType: 'without_response',
  };
  return [
    stepOf(target, unlockFrame(name)),
    stepOf(target, systemInfoFrame(Math.floor(now.getTime() / 1000))),
    stepOf(target, settingGetFrame()),
    stepOf(target, functionInfoFrame()),
  ];
}

function ftmsPlan(
  family: Exclude<TreadmillFamily, 'wilink'>,
  dump: TreadmillGattDump,
  now: Date,
): LinkPlanParts {
  const subscriptions = ftmsSubscriptions(dump);
  const supplement = family === 'ftms_supplement';
  return {
    family,
    subscriptions: supplement
      ? [
          ...subscriptions,
          subscription(SUPPLEMENT_SERVICE, SUPPLEMENT_NOTIFY, 'notify', {
            coalescePrefix: null,
            changeByte: null,
          }),
        ]
      : subscriptions,
    control: ftmsTarget(),
    preamble:
      family === 'ftms_odm' ? { characteristic: ODM_CHARACTERISTIC, hex: ODM_PREAMBLE } : null,
    cccdPacingMs: CCCD_PACING_MS,
    writePacingMs: family === 'ftms' ? FTMS_WRITE_PACING_MS : VENDOR_WRITE_PACING_MS,
    initial: [
      ...(supplement ? supplementInitial(dump.name, now) : []),
      stepOf(ftmsTarget(), requestControl()),
    ],
    statusRequest: null,
  };
}

export function linkPlanParts(
  family: TreadmillFamily,
  dump: TreadmillGattDump,
  now: Date,
): LinkPlanParts {
  return family === 'wilink' ? wilinkPlan() : ftmsPlan(family, dump, now);
}
