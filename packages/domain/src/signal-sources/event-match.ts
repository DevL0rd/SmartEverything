import { cameraDetectionsOf, miotDeviceEventsOf, type EventKind } from '../events';
import { CAMERA_DETECTION_PRESENTATIONS } from '../event-labels';
import { COMPUTER_ACTIONS } from '../node/node-requests';
import { PHONE_CONTEXT_STATES } from '../phones';
import type { SignalMatchSpec } from './spec';

const ANY = null;

const SOURCE: SignalMatchSpec = { key: 'source', label: 'Where the event came from', values: ANY };
const COMPONENT: SignalMatchSpec = { key: 'component', label: 'Device component', values: ANY };
const VALUE: SignalMatchSpec = { key: 'value', label: 'Reported value', values: ANY };
const CODE: SignalMatchSpec = { key: 'code', label: 'Tuya data point code', values: ANY };
const PLACE: SignalMatchSpec = { key: 'place', label: 'Place', values: ANY };

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

function xiaomiEvent(kind: EventKind): SignalMatchSpec[] {
  const names = miotDeviceEventsOf(kind);
  return names.length === 0
    ? []
    : [{ key: 'miotEvent', label: 'Xiaomi event name (not cameras)', values: names }];
}

function xiaomiDevice(kind: EventKind): SignalMatchSpec[] {
  return [SOURCE, ...xiaomiEvent(kind)];
}

const SMARTTHINGS_ALERT = [COMPONENT, VALUE];
const TUYA_ALERT = [CODE, VALUE];

const PRESENCE: readonly SignalMatchSpec[] = [
  { key: 'transport', label: 'Connection', values: ['local', 'cloud'] },
  { key: 'status', label: 'Reported status', values: ANY },
];

export const EVENT_MATCH: Readonly<Record<EventKind, readonly SignalMatchSpec[]>> = {
  doorbell: [cameraDetection('doorbell'), ...TUYA_ALERT],
  call: [cameraDetection('call')],
  motion: [cameraDetection('motion'), ...TUYA_ALERT, COMPONENT],
  person: [cameraDetection('person'), ...xiaomiEvent('person')],
  sound: [cameraDetection('sound')],
  pet: [cameraDetection('pet')],
  alarm: [
    ...xiaomiDevice('alarm'),
    ...TUYA_ALERT,
    { key: 'cause', label: 'What raised the alarm', values: ['gas', 'carbon_monoxide', 'sos'] },
  ],
  button: [
    ...xiaomiDevice('button'),
    ...SMARTTHINGS_ALERT,
    CODE,
    { key: 'button', label: 'Button number', values: ANY },
    { key: 'action', label: 'Press type', values: ANY },
  ],
  leak: [...SMARTTHINGS_ALERT, CODE],
  smoke: [...SMARTTHINGS_ALERT, CODE],
  opened: xiaomiDevice('opened'),
  maintenance: xiaomiDevice('maintenance'),
  fault: xiaomiDevice('fault'),
  activity: xiaomiDevice('activity'),
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
  provider_error: [],
  computer_power: [
    { key: 'action', label: 'Power action', values: COMPUTER_ACTIONS },
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
};
