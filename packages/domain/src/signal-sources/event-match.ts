import {
  LAUNDRY_MIOT_EVENTS,
  cameraDetectionsOf,
  miotDeviceEventsOf,
  type EventKind,
} from '../events';
import { CAMERA_DETECTION_PRESENTATIONS } from '../event-labels';
import { COMPUTER_ACTIONS } from '../node/node-requests';
import { MACHINE_ACTIONS } from '../machine-actions';
import { PHONE_CONTEXT_STATES } from '../phones';
import { BRUSH_MODES } from '../toothbrush';
import { PAD_GOAL_KINDS, SESSION_KINDS } from '../treadmill';
import { PROVIDER_LINK_MATCH } from './provider';
import type { SignalMatchSpec } from './spec';

const ANY = null;

const SOURCE: SignalMatchSpec = { key: 'source', label: 'Where the event came from', values: ANY };
const COMPONENT: SignalMatchSpec = { key: 'component', label: 'Device component', values: ANY };
const VALUE: SignalMatchSpec = { key: 'value', label: 'Reported value', values: ANY };
const CODE: SignalMatchSpec = { key: 'code', label: 'Tuya data point code', values: ANY };
const PLACE: SignalMatchSpec = { key: 'place', label: 'Place', values: ANY };
const FAMILY: SignalMatchSpec = { key: 'family', label: 'Kind of appliance', values: ANY };
const ITEM: SignalMatchSpec = { key: 'item', label: 'Part or supply concerned', values: ANY };
const STATE: SignalMatchSpec = { key: 'state', label: 'State of that part', values: ANY };
const TOPIC: SignalMatchSpec = { key: 'topic', label: 'What it is about', values: ANY };
const SUMMARY: SignalMatchSpec = { key: 'summary', label: 'Event summary', values: ANY };
const EVENT_NAME: SignalMatchSpec = { key: 'event', label: 'Event name', values: ANY };
const ATTRIBUTE: SignalMatchSpec = {
  key: 'attribute',
  label: 'Attribute that changed',
  values: ANY,
};
const CAPABILITY: SignalMatchSpec = { key: 'capability', label: 'Device capability', values: ANY };
const EVENT_TYPE: SignalMatchSpec = { key: 'eventType', label: 'Camera event type', values: ANY };
const HAS_CLIP: SignalMatchSpec = { key: 'hasClip', label: 'Has a recorded clip', values: ANY };
const MIOT_EVENT: SignalMatchSpec = { key: 'miotEvent', label: 'Xiaomi event name', values: ANY };
const FILE_ID: SignalMatchSpec = { key: 'fileId', label: 'Clip file id', values: ANY };
const IMAGE_ID: SignalMatchSpec = { key: 'imgStoreId', label: 'Snapshot id', values: ANY };

const TREADMILL_MATCH: readonly SignalMatchSpec[] = [
  {
    key: 'phase',
    label: 'What the treadmill is doing',
    values: ['started', 'paused', 'resumed', 'finished', 'goal_reached'],
  },
  { key: 'walker', label: 'Who is walking', values: ANY },
  { key: 'kind', label: 'Kind of session', values: SESSION_KINDS },
  { key: 'goal', label: 'Goal that was reached', values: PAD_GOAL_KINDS },
];

const TREADMILL_FAULT: SignalMatchSpec = {
  key: 'code',
  label: 'Treadmill fault code (E01 to E13, or safety_stop)',
  values: ANY,
};

const TREADMILL_REASON: SignalMatchSpec = {
  key: 'reason',
  label: 'Why maintenance is due',
  values: ['lubrication_due'],
};

const BOTTLE_ACTIVITY: SignalMatchSpec = {
  key: 'activity',
  label: 'What the water bottle did',
  values: ['drink', 'refill', 'uv_clean', 'goal_reached', 'drinks_imported'],
};

const BOTTLE_MAINTENANCE: SignalMatchSpec = {
  key: 'maintenance',
  label: 'Why the water bottle needs care',
  values: ['filter_due', 'battery_low'],
};

const BOTTLE_FAULT: SignalMatchSpec = { key: 'fault', label: 'Water bottle fault', values: ANY };

const BRUSHING_MATCH: readonly SignalMatchSpec[] = [
  { key: 'brushing', label: 'What the toothbrush did', values: ['finished'] },
  { key: 'complete', label: 'Whether the whole routine was brushed', values: ANY },
  { key: 'person', label: 'Who brushed', values: ANY },
  { key: 'mode', label: 'Brushing mode', values: BRUSH_MODES },
  { key: 'durationS', label: 'Seconds brushed', values: ANY },
];

const BRUSH_HEAD_MAINTENANCE: SignalMatchSpec = {
  key: 'brushHead',
  label: 'How worn the brush head is',
  values: ['warn', 'due'],
};

const BRUSH_FAULT: SignalMatchSpec = {
  key: 'brushFault',
  label: 'Toothbrush error bits (hexadecimal)',
  values: ANY,
};

export const APP_MATCH: readonly SignalMatchSpec[] = [
  { key: 'app', label: 'App name', values: ANY },
  { key: 'appId', label: 'App id', values: ANY },
  { key: 'title', label: 'Window title', values: ANY },
  { key: 'user', label: 'Signed-in user', values: ANY },
  { key: 'personId', label: 'Person who owns the computer', values: ANY },
];

function cameraDetection(kind: EventKind): SignalMatchSpec {
  const values = cameraDetectionsOf(kind);
  return {
    key: 'detection',
    label: 'What the camera detected',
    values,
    valueLabels: Object.fromEntries(
      values.map((value) => [value, CAMERA_DETECTION_PRESENTATIONS[value].label]),
    ),
  };
}

function xiaomiEvent(kind: EventKind): SignalMatchSpec {
  return {
    key: 'miotEvent',
    label: 'Xiaomi event name (not cameras)',
    values: miotDeviceEventsOf(kind),
  };
}

function xiaomiDevice(kind: EventKind): SignalMatchSpec[] {
  return [SOURCE, xiaomiEvent(kind)];
}

const SMARTTHINGS_ALERT = [COMPONENT, VALUE];
const TUYA_ALERT = [CODE, VALUE];
const SMARTTHINGS_EVENT = [COMPONENT, VALUE, TOPIC, SUMMARY, CAPABILITY];
const CAMERA_LISTED = [SOURCE, MIOT_EVENT, EVENT_TYPE, HAS_CLIP, FILE_ID, IMAGE_ID];

const PRESENCE: readonly SignalMatchSpec[] = [
  { key: 'transport', label: 'Connection', values: ['local', 'cloud'] },
  { key: 'status', label: 'Reported status', values: ANY },
];

export const EVENT_MATCH: Readonly<Record<EventKind, readonly SignalMatchSpec[]>> = {
  doorbell: [cameraDetection('doorbell'), ...TUYA_ALERT, ...CAMERA_LISTED],
  call: [cameraDetection('call'), ...CAMERA_LISTED],
  motion: [cameraDetection('motion'), ...TUYA_ALERT, COMPONENT, ...CAMERA_LISTED],
  no_motion: xiaomiDevice('no_motion'),
  person: [cameraDetection('person'), ...CAMERA_LISTED],
  sound: [cameraDetection('sound'), ...CAMERA_LISTED],
  pet: [cameraDetection('pet'), ...CAMERA_LISTED],
  alarm: [
    ...xiaomiDevice('alarm'),
    ...TUYA_ALERT,
    { key: 'cause', label: 'What raised the alarm', values: ['gas', 'carbon_monoxide', 'sos'] },
  ],
  button: [
    ...xiaomiDevice('button'),
    ...SMARTTHINGS_ALERT,
    CODE,
    { key: 'protocol', label: 'Xiaomi protocol', values: ANY },
    { key: 'method', label: 'Xiaomi legacy event name', values: ANY },
    { key: 'button', label: 'Button number', values: ANY },
    { key: 'action', label: 'Press type', values: ANY },
  ],
  leak: [...SMARTTHINGS_ALERT, CODE],
  smoke: [...SMARTTHINGS_ALERT, CODE],
  opened: [...xiaomiDevice('opened'), ...SMARTTHINGS_EVENT],
  maintenance: [
    SOURCE,
    {
      key: 'miotEvent',
      label: 'Xiaomi event name',
      values: [...miotDeviceEventsOf('maintenance'), LAUNDRY_MIOT_EVENTS.cleanCompleted],
    },
    FAMILY,
    ITEM,
    STATE,
    TREADMILL_REASON,
    BOTTLE_MAINTENANCE,
    BRUSH_HEAD_MAINTENANCE,
    ...SMARTTHINGS_EVENT,
  ],
  fault: [...xiaomiDevice('fault'), TREADMILL_FAULT, BOTTLE_FAULT, BRUSH_FAULT],
  activity: [
    SOURCE,
    MIOT_EVENT,
    EVENT_NAME,
    ATTRIBUTE,
    CODE,
    FAMILY,
    ...SMARTTHINGS_EVENT,
    EVENT_TYPE,
    HAS_CLIP,
    FILE_ID,
    IMAGE_ID,
    ...TREADMILL_MATCH,
    BOTTLE_ACTIVITY,
    ...BRUSHING_MATCH,
  ],
  cycle_finished: [
    SOURCE,
    {
      key: 'miotEvent',
      label: 'Xiaomi event name',
      values: [LAUNDRY_MIOT_EVENTS.washEnd, LAUNDRY_MIOT_EVENTS.washEndLog],
    },
    FAMILY,
    { key: 'outcome', label: 'How the cycle ended', values: ['completed', 'stopped'] },
    { key: 'program', label: 'Program', values: ANY },
  ],
  device_online: PRESENCE,
  device_offline: PRESENCE,
  automation_run: [
    { key: 'automationId', label: 'Automation', values: ANY },
    { key: 'name', label: 'Automation name', values: ANY },
    { key: 'outcome', label: 'How it ended', values: ['succeeded', 'failed'] },
    { key: 'durationMs', label: 'How long it ran (ms)', values: ANY },
    { key: 'error', label: 'Why it failed', values: ANY },
    { key: 'message', label: 'Notification text', values: ANY },
  ],
  provider_error: [
    ...PROVIDER_LINK_MATCH,
    { key: 'operation', label: 'What was being done', values: ANY },
  ],
  computer_power: [
    { key: 'action', label: 'Power action', values: COMPUTER_ACTIONS },
    { key: 'source', label: 'Who asked', values: ANY },
    { key: 'client', label: 'Which app asked', values: ANY },
  ],
  machine_action: [
    { key: 'action', label: 'Action', values: MACHINE_ACTIONS },
    { key: 'source', label: 'Who asked', values: ANY },
    { key: 'client', label: 'Which app asked', values: ANY },
  ],
  phone_context_changed: [
    { key: 'from', label: 'Doing before', values: PHONE_CONTEXT_STATES },
    { key: 'to', label: 'Doing now', values: PHONE_CONTEXT_STATES },
    { key: 'confidence', label: 'Confidence (percent)', values: ANY },
    PLACE,
  ],
  place_arrived: [PLACE],
  place_left: [PLACE],
  parked: [PLACE],
  phone_unlocked: [],
  zone_enter: [COMPONENT, { key: 'parentExternalId', label: 'Physical sensor', values: ANY }],
  zone_leave: [COMPONENT, { key: 'parentExternalId', label: 'Physical sensor', values: ANY }],
  app_opened: APP_MATCH,
  app_closed: APP_MATCH,
  app_focused: APP_MATCH,
  app_unfocused: APP_MATCH,
  signal: [],
};
