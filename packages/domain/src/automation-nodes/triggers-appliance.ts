import type { FlowType } from '../automation-v3/types';
import { EVENT_KIND_LABELS } from '../event-labels';
import type { EventKind } from '../events';
import type { NodeKind } from './define';
import { ANY, AT, input, output, ref, trigger } from './trigger-parts';
import type { MatcherMapping, MatcherVariant } from './triggers-device';

export const APPLIANCE_EVENTS = [
  'cycle_finished',
  'maintenance',
  'fault',
] as const satisfies readonly EventKind[];

export const SAFETY_KINDS = ['leak', 'smoke', 'gas', 'alarm'] as const;

const SAFETY_LABELS: Readonly<Record<(typeof SAFETY_KINDS)[number], string>> = {
  leak: EVENT_KIND_LABELS.leak,
  smoke: EVENT_KIND_LABELS.smoke,
  gas: 'Gas',
  alarm: EVENT_KIND_LABELS.alarm,
};

const APPLIANCE_EVENT_TYPE: FlowType = {
  t: 'choice',
  options: APPLIANCE_EVENTS.map((id) => ({ id, label: EVENT_KIND_LABELS[id] })),
};

const SAFETY_KIND_TYPE: FlowType = {
  t: 'choice',
  options: SAFETY_KINDS.map((id) => ({ id, label: SAFETY_LABELS[id] })),
};

const EVENT_DETAIL: FlowType = { t: 'record', values: ANY };

export const APPLIANCE_TRIGGER_VARIANTS: Readonly<Record<string, MatcherVariant>> =
  Object.fromEntries(APPLIANCE_EVENTS.map((kind) => [kind, { source: 'event', kind }]));

export const SAFETY_TRIGGER_VARIANTS: Readonly<Record<string, MatcherVariant>> = {
  leak: { source: 'device', kind: 'state', field: 'leak', test: { is: 'eq', to: true } },
  smoke: { source: 'device', kind: 'state', field: 'smoke', test: { is: 'eq', to: true } },
  gas: { source: 'device', kind: 'state', field: 'gas', test: { is: 'eq', to: true } },
  alarm: { source: 'event', kind: 'alarm' },
};

export const APPLIANCE_MATCHER_MAPPINGS: Readonly<Record<string, MatcherMapping>> = {
  'trigger.appliance': {
    variantPort: 'event',
    defaultVariant: 'cycle_finished',
    variants: APPLIANCE_TRIGGER_VARIANTS,
    subjectPort: 'device',
    fieldPort: null,
    matchPorts: { room: 'roomId' },
    runtimePorts: [],
  },
  'trigger.safety': {
    variantPort: 'kind',
    defaultVariant: 'leak',
    variants: SAFETY_TRIGGER_VARIANTS,
    subjectPort: 'device',
    fieldPort: null,
    matchPorts: { room: 'roomId' },
    runtimePorts: [],
  },
};

export const APPLIANCE_TRIGGER_KINDS: readonly NodeKind[] = [
  trigger({
    tier: 'v1.1',
    id: 'trigger.appliance',
    name: 'Appliance event',
    icon: 'washer',
    description:
      'Starts when an appliance finishes a cycle, needs maintenance or reports a fault. Pick one appliance or a room, or leave both empty for every appliance in the home.',
    inputs: [
      input('device', ref('device'), 'One appliance.', { summary: true }),
      input('room', ref('room'), 'Every appliance in this room.'),
      input('event', APPLIANCE_EVENT_TYPE, 'Cycle finished, needs maintenance or fault.', {
        default: 'cycle_finished',
        summary: true,
      }),
    ],
    outputs: [
      output('device', ref('device'), 'The appliance.'),
      output('kind', APPLIANCE_EVENT_TYPE, 'What happened.'),
      output(
        'detail',
        EVENT_DETAIL,
        'What the appliance reported, such as the program, the part or the fault code.',
      ),
      AT,
    ],
    summary: 'When {device} reports {event}',
    keywords: [
      'appliance',
      'washer',
      'dryer',
      'cycle',
      'finished',
      'maintenance',
      'fault',
      'error',
    ],
  }),
  trigger({
    tier: 'v1.1',
    id: 'trigger.safety',
    name: 'Safety alert',
    icon: 'siren',
    description:
      'Starts when a leak, smoke, gas or alarm sensor goes off. Pick one device or a room, or leave both empty for every device in the home.',
    inputs: [
      input('device', ref('device'), 'One device.', { summary: true }),
      input('room', ref('room'), 'Every device in this room.'),
      input('kind', SAFETY_KIND_TYPE, 'Leak, smoke, gas or alarm.', {
        default: 'leak',
        summary: true,
      }),
    ],
    outputs: [
      output('device', ref('device'), 'The device that raised the alert.'),
      output('kind', SAFETY_KIND_TYPE, 'What was detected.'),
      AT,
    ],
    summary: 'When {device} detects {kind}',
    keywords: ['safety', 'leak', 'water', 'flood', 'smoke', 'fire', 'gas', 'alarm', 'siren'],
  }),
];
