import type { EventKind, JsonValue } from '@smarteverything/domain';

export interface SmartThingsEventMapping {
  readonly kind: EventKind;
  readonly kinds?: Readonly<Record<string, EventKind>>;
  readonly values?: readonly JsonValue[];
  readonly summaries?: Readonly<Record<string, string>>;
  readonly topic?: string;
  readonly changesOnly?: true;
}
export const SMARTTHINGS_EVENT_MAPPINGS: Readonly<Record<string, SmartThingsEventMapping>> = {
  'button.button': { kind: 'button' },
  'motionSensor.motion': { kind: 'motion', values: ['active'] },
  'waterSensor.water': { kind: 'leak', values: ['wet'] },
  'smokeDetector.smoke': { kind: 'smoke', values: ['detected', 'tested'] },
  'samsungce.doorState.doorState': {
    kind: 'activity',
    kinds: { open: 'opened' },
    topic: 'Door',
    changesOnly: true,
    summaries: { open: 'Door opened', closed: 'Door closed' },
  },
  'samsungce.ovenOperatingState.operatingState': {
    kind: 'activity',
    topic: 'Cooking',
    changesOnly: true,
    summaries: { ready: 'Microwave ready', running: 'Cooking started', paused: 'Cooking paused' },
  },
  'samsungce.ovenOperatingState.ovenJobState': {
    kind: 'activity',
    topic: 'Cooking stage',
    changesOnly: true,
    summaries: {
      finished: 'Cooking finished',
      preheat: 'Preheating',
      cooling: 'Cooling down',
      warming: 'Keeping food warm',
      defrosting: 'Defrosting',
      cleaning: 'Cleaning started',
    },
  },
  'remoteControlStatus.remoteControlEnabled': {
    kind: 'activity',
    topic: 'Remote control',
    changesOnly: true,
    summaries: { true: 'Remote control enabled', false: 'Remote control disabled' },
  },
  'samsungce.kidsLock.lockState': {
    kind: 'activity',
    topic: 'Child lock',
    changesOnly: true,
    summaries: {
      locked: 'Child lock enabled',
      unlocked: 'Child lock disabled',
      paused: 'Child lock temporarily paused',
    },
  },
  'samsungce.softwareUpdate.newVersionAvailable': {
    kind: 'activity',
    kinds: { true: 'maintenance' },
    topic: 'Software update',
    changesOnly: true,
    summaries: { true: 'Software update available', false: 'No software update available' },
  },
  'samsungce.softwareUpdate.operatingState': {
    kind: 'activity',
    topic: 'Software update',
    changesOnly: true,
    summaries: {
      preparing: 'Software update preparing',
      inprogress: 'Software update installing',
      completed: 'Software update completed',
      rebooting: 'Restarting after software update',
      delayed: 'Software update delayed',
    },
  },
};
