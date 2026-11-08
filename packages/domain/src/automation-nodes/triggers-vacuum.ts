import { z } from 'zod';
import type { FlowType } from '../automation-v3/types';
import type { SignalInput } from '../signals';
import type { JsonValue } from '../values';
import type { NodeKind } from './define';
import { AT, TEXT, input, output, trigger } from './trigger-parts';
import type { MatcherMapping, MatcherVariant } from './triggers-device';

export const VACUUM_REF: FlowType = { t: 'ref', of: 'device', families: ['vacuum'] };

export const VACUUM_TRIGGER_EVENTS = [
  { id: 'started', label: 'Started cleaning' },
  { id: 'finished', label: 'Finished cleaning' },
  { id: 'error', label: 'Ran into a problem' },
  { id: 'docked', label: 'Returned to the dock' },
  { id: 'needs_emptying', label: 'Station needs emptying' },
  { id: 'consumable_low', label: 'A part is running low' },
] as const;

export type VacuumTriggerEvent = (typeof VACUUM_TRIGGER_EVENTS)[number]['id'];

const VACUUM_FAMILY = 'vacuum';
const CLEAN_STARTED = 'clean_started';
const DOCKED_READINGS = ['charging', 'docked'] as const;
const STATION_TANK_FULL = 'Full';
const CLEANING_ROLE = 'cleaning';
const STATION_TANK_ROLE = 'vacuum_sewage_tank';

const EVENT_TYPE: FlowType = { t: 'choice', options: [...VACUUM_TRIGGER_EVENTS] };
const ROOM_NAMES: FlowType = { t: 'list', of: TEXT };

export const VACUUM_TRIGGER_VARIANTS: Readonly<Record<VacuumTriggerEvent, MatcherVariant>> = {
  started: {
    source: 'event',
    kind: 'activity',
    match: { family: VACUUM_FAMILY, name: CLEAN_STARTED },
  },
  finished: { source: 'event', kind: 'cycle_finished', match: { family: VACUUM_FAMILY } },
  error: { source: 'event', kind: 'fault', match: { family: VACUUM_FAMILY } },
  docked: {
    source: 'device',
    kind: 'state',
    match: { family: VACUUM_FAMILY, role: CLEANING_ROLE },
    test: { is: 'in', to: DOCKED_READINGS },
  },
  needs_emptying: {
    source: 'device',
    kind: 'state',
    match: { family: VACUUM_FAMILY, role: STATION_TANK_ROLE },
    test: { is: 'eq', to: STATION_TANK_FULL },
  },
  consumable_low: {
    source: 'event',
    kind: 'maintenance',
    match: { family: VACUUM_FAMILY, state: 'low' },
  },
};

export const VACUUM_MATCHER_MAPPINGS: Readonly<Record<string, MatcherMapping>> = {
  'trigger.vacuum': {
    variantPort: 'event',
    defaultVariant: 'finished',
    variants: VACUUM_TRIGGER_VARIANTS,
    subjectPort: 'vacuum',
    fieldPort: null,
    matchPorts: {},
    runtimePorts: [],
  },
};

const REPORTED_ROOMS = z.array(z.looseObject({ name: z.string() }));

const REPORTED_TITLE = z.string().min(1);

function eventOf(signal: SignalInput): VacuumTriggerEvent {
  if (signal.source === 'device')
    return signal.data['role'] === STATION_TANK_ROLE ? 'needs_emptying' : 'docked';
  switch (signal.kind) {
    case 'activity':
      return 'started';
    case 'fault':
      return 'error';
    case 'maintenance':
      return 'consumable_low';
    default:
      return 'finished';
  }
}

function roomNamesOf(signal: SignalInput): readonly string[] {
  const reported = REPORTED_ROOMS.safeParse(signal.data['rooms']);
  return reported.success ? reported.data.map((room) => room.name) : [];
}

function faultOf(signal: SignalInput): string | undefined {
  const title = REPORTED_TITLE.safeParse(signal.data['title']);
  return signal.kind === 'fault' && title.success ? title.data : undefined;
}

export function vacuumTriggerOutputs(
  signal: SignalInput,
): Readonly<Record<string, JsonValue | undefined>> {
  return {
    event: eventOf(signal),
    rooms: [...roomNamesOf(signal)],
    fault: faultOf(signal),
  };
}

export const VACUUM_TRIGGER_KINDS: readonly NodeKind[] = [
  trigger({
    tier: 'v1.1',
    id: 'trigger.vacuum',
    name: 'Vacuum event',
    icon: 'vacuum',
    description:
      'Starts when a robot vacuum starts or finishes cleaning, runs into a problem, returns to its dock, needs its station emptied or has a part running low. Pick one vacuum, or leave it empty for every robot vacuum in the home.',
    inputs: [
      input('vacuum', VACUUM_REF, 'One robot vacuum.', { summary: true, ui: { label: 'Vacuum' } }),
      input('event', EVENT_TYPE, 'What the robot did or needs.', {
        default: 'finished',
        summary: true,
        ui: { label: 'When it' },
      }),
    ],
    outputs: [
      output('vacuum', VACUUM_REF, 'The robot vacuum.'),
      output('event', EVENT_TYPE, 'What happened.'),
      output(
        'rooms',
        ROOM_NAMES,
        'The rooms of the job, named as the robot map names them. Empty when the event is not about a job.',
      ),
      output('fault', TEXT, 'What went wrong, when the robot ran into a problem.', true),
      AT,
    ],
    summary: 'When {vacuum} {event}',
    keywords: [
      'vacuum',
      'robot',
      'hoover',
      'clean',
      'cleaning',
      'started',
      'finished',
      'done',
      'error',
      'stuck',
      'fault',
      'dock',
      'docked',
      'station',
      'empty',
      'consumable',
      'brush',
      'filter',
    ],
  }),
];
