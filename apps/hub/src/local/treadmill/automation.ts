import {
  BELT_STEP_KMH,
  MAX_BELT_KMH,
  MIN_BELT_KMH,
  PAD_GOAL_KINDS,
  PLUGIN_AUTOMATION,
  type JsonValue,
  type PadGoalKind,
} from '@smarteverything/domain';
import { z } from 'zod';
import type { PluginKindCatalog } from '../../automations/plugin-kinds/catalog';
import {
  registerDriverAutomation,
  type DriverAutomationInput,
} from '../../automations/plugin-kinds/contributions';
import type { DriverRuntime } from '../../automations/plugin-kinds/driver-nodes';
import {
  actionNode,
  automation,
  eventTrigger,
  input,
  optionalInput,
  ports,
  type PortKind,
} from '../../plugins/builtin/automation-kit';
import { TREADMILL_DRIVER } from './config';

const TREADMILL_NAME = 'Kingsmith G15 treadmill';

const TIMEOUT = { default: 60_000, max: 300_000 } as const;

const TREADMILL: PortKind<string> = { type: { t: 'ref', of: 'device', families: ['treadmill'] } };

const GOAL_CHOICES = [
  { id: 'none', label: 'No goal' },
  { id: 'time', label: 'Time' },
  { id: 'distance', label: 'Distance' },
  { id: 'calories', label: 'Calories' },
] as const satisfies readonly { readonly id: PadGoalKind; readonly label: string }[];

function maybe<V>(kind: PortKind<V>): PortKind<V | undefined> {
  return { type: { t: 'optional', of: kind.type } };
}

export const START_INPUT = z
  .strictObject({
    device: z.string().min(1),
    speed: z.number().min(MIN_BELT_KMH).max(MAX_BELT_KMH).optional(),
    goal: z.enum(PAD_GOAL_KINDS).optional(),
    goalValue: z.int().min(1).optional(),
  })
  .refine((request) => request.goal !== 'none' || request.goalValue === undefined, {
    message: 'a goal value needs a goal',
  });

export type StartRequest = z.output<typeof START_INPUT>;

export const START_TOOL = { name: 'start', input: START_INPUT };

export type BeltControl = 'belt_goal' | 'belt_goal_value' | 'belt_command' | 'belt_speed';

export interface TreadmillControls {
  readonly set: (control: BeltControl, value: JsonValue) => Promise<JsonValue>;
}

export async function startTreadmill(
  controls: TreadmillControls,
  request: StartRequest,
): Promise<{ readonly started: true }> {
  if (request.goal !== undefined) await controls.set('belt_goal', request.goal);
  if (request.goalValue !== undefined) await controls.set('belt_goal_value', request.goalValue);
  await controls.set('belt_command', 'start');
  if (request.speed !== undefined) await controls.set('belt_speed', request.speed);
  return { started: true };
}

const START = actionNode({
  id: 'start',
  version: 1,
  title: 'Start the treadmill',
  description:
    'Starts the belt, optionally with a goal and a speed. The belt counts down first, then walks at the speed.',
  icon: 'footprints',
  keywords: ['treadmill', 'walking pad', 'kingsmith', 'start', 'walk', 'belt'],
  summary: 'Start {treadmill}',
  tool: START_TOOL,
  inputs: {
    treadmill: input(TREADMILL, {
      title: 'Treadmill',
      description: 'The treadmill to start.',
    }),
    speed: optionalInput(ports.number({ min: MIN_BELT_KMH, max: MAX_BELT_KMH, unit: 'km/h' }), {
      title: 'Speed',
      description: 'The speed to walk at once the belt runs. Left out, the belt keeps its own.',
      ui: { min: MIN_BELT_KMH, max: MAX_BELT_KMH, step: BELT_STEP_KMH, unit: 'km/h' },
    }),
    goal: optionalInput(ports.choice(GOAL_CHOICES), {
      title: 'Goal',
      description: 'What the walk aims for. Left out, the goal on the treadmill stays as it is.',
    }),
    goalValue: optionalInput(ports.number({ integer: true, min: 1 }), {
      title: 'Goal amount',
      description:
        'Metres for a distance goal, calories for a calorie goal and seconds for a time goal.',
      ui: { min: 1, step: 1 },
    }),
  },
  args: {
    device: { port: 'treadmill' },
    speed: { port: 'speed' },
    goal: { port: 'goal' },
    goalValue: { port: 'goalValue' },
  },
  timeout: TIMEOUT,
  retry: 'external',
});

const WALK_FILTERS = {
  treadmill: {
    kind: TREADMILL,
    title: 'Treadmill',
    description: 'Only walks on this treadmill.',
    match: 'subject',
  },
  walker: {
    kind: ports.ref('person'),
    title: 'Walker',
    description: 'Only walks by this person.',
    match: 'profileId',
  },
} as const;

const WALK_FINISHED = eventTrigger({
  id: 'walk_finished',
  version: 1,
  title: 'A walk ended',
  description: 'Fires when a walk on the treadmill is over, with what was walked.',
  icon: 'footprints',
  keywords: ['treadmill', 'walk', 'finished', 'done', 'workout', 'kingsmith'],
  summary: 'A walk on {treadmill} by {walker} ended',
  event: { deviceEvent: 'activity', phase: 'finished' },
  filters: WALK_FILTERS,
  outputs: {
    walker: { kind: maybe(ports.text()), title: 'Walker name', from: 'walker' },
    person: { kind: maybe(ports.ref('person')), title: 'Walker', from: 'profileId' },
    duration: {
      kind: ports.number({ integer: true, min: 0, unit: 's' }),
      title: 'Walking time in seconds',
      from: 'duration_s',
    },
    distance: {
      kind: ports.number({ integer: true, min: 0, unit: 'm' }),
      title: 'Distance in metres',
      from: 'distance_m',
    },
    steps: {
      kind: maybe(ports.number({ integer: true, min: 0 })),
      title: 'Steps',
      from: 'steps',
    },
  },
});

const FAULT = eventTrigger({
  id: 'fault',
  version: 1,
  title: 'The treadmill reports a fault',
  description: 'Fires when the treadmill stops for a safety reason or reports a fault code.',
  icon: 'alert',
  keywords: ['treadmill', 'fault', 'error', 'safety', 'stop', 'kingsmith'],
  summary: 'Fault on {treadmill}',
  event: { deviceEvent: 'fault' },
  filters: {
    treadmill: {
      kind: TREADMILL,
      title: 'Treadmill',
      description: 'Only faults of this treadmill.',
      match: 'subject',
    },
  },
  outputs: { code: { kind: ports.text(), title: 'Fault code', from: 'code' } },
});

const MAINTENANCE_DUE = eventTrigger({
  id: 'maintenance_due',
  version: 1,
  title: 'The treadmill needs maintenance',
  description: 'Fires after a walk when the belt is due for lubrication.',
  icon: 'wrench',
  keywords: ['treadmill', 'maintenance', 'lubricate', 'belt', 'oil', 'kingsmith'],
  summary: 'Maintenance due on {treadmill}',
  event: { deviceEvent: 'maintenance' },
  filters: {
    treadmill: {
      kind: TREADMILL,
      title: 'Treadmill',
      description: 'Only maintenance of this treadmill.',
      match: 'subject',
    },
  },
  outputs: {
    reason: { kind: ports.text(), title: 'What is due', from: 'reason' },
    days: {
      kind: maybe(ports.number({ integer: true, min: 1 })),
      title: 'Days between services',
      from: 'days',
    },
  },
});

export const TREADMILL_AUTOMATION: DriverAutomationInput = {
  id: TREADMILL_DRIVER,
  name: TREADMILL_NAME,
  icon: 'footprints',
  version: '1',
  automation: automation({
    nodes: [START],
    triggers: [WALK_FINISHED, FAULT, MAINTENANCE_DUE],
  }),
};

export function registerTreadmillAutomation(
  catalog: Pick<PluginKindCatalog, 'replace' | 'remove' | 'driverNodes'>,
  runtime: DriverRuntime,
): () => void {
  const stopKinds = registerDriverAutomation(catalog, TREADMILL_AUTOMATION);
  const stopNodes = catalog.driverNodes.register(
    TREADMILL_DRIVER,
    PLUGIN_AUTOMATION.parse(TREADMILL_AUTOMATION.automation),
    runtime,
  );
  return (): void => {
    stopNodes();
    stopKinds();
  };
}
