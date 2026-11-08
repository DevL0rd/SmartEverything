import {
  PLUGIN_AUTOMATION,
  WATCH_ALARM,
  WATCH_SPORT,
  WATCH_SPORT_LABELS,
  type DeviceFamily,
  type PluginOption,
  type WatchFace,
  type WatchSport,
} from '@smarteverything/domain';
import { z } from 'zod';
import type { PluginKindCatalog } from '../automations/plugin-kinds/catalog';
import {
  registerDriverAutomation,
  type DriverAutomationInput,
} from '../automations/plugin-kinds/contributions';
import type { DriverRuntime } from '../automations/plugin-kinds/driver-nodes';
import {
  actionNode,
  automation,
  entity,
  input,
  optionalInput,
  output,
  ports,
  type PortKind,
} from '../plugins/builtin/automation-kit';
import { ANSWER_TIMEOUT_MS } from './pending-answers';

export const WATCH_AUTOMATION_ID = 'watch';

export const WATCH_FACE_PICKER = 'faces';

export const WATCH_NODE_ACTIONS = [
  'find_watch',
  'stop_finding',
  'sync',
  'start_workout',
  'pause_workout',
  'resume_workout',
  'stop_workout',
] as const;

export type WatchNodeAction = (typeof WATCH_NODE_ACTIONS)[number];

const DAY_IDS = WATCH_ALARM.shape.days.element.options;

type Weekday = (typeof DAY_IDS)[number];

const ACTION_LABELS: Readonly<Record<WatchNodeAction, string>> = {
  find_watch: 'Find the watch',
  stop_finding: 'Stop finding the watch',
  sync: 'Sync',
  start_workout: 'Start a workout',
  pause_workout: 'Pause the workout',
  resume_workout: 'Resume the workout',
  stop_workout: 'Stop the workout',
};

const DAY_LABELS: Readonly<Record<Weekday, string>> = {
  mon: 'Monday',
  tue: 'Tuesday',
  wed: 'Wednesday',
  thu: 'Thursday',
  fri: 'Friday',
  sat: 'Saturday',
  sun: 'Sunday',
};

export const WATCH_ERROR_CODES = {
  unreachable: 'watch_unreachable',
  unanswered: 'watch_unanswered',
  refused: 'watch_refused',
  notFound: 'watch_not_found',
} as const;

const WATCH_FAMILIES: readonly DeviceFamily[] = ['wearable'];

const DEVICE = z.string().min(1);

export const WATCH_ACTION_TOOL = {
  name: 'action',
  input: z.strictObject({
    device: DEVICE,
    action: z.enum(WATCH_NODE_ACTIONS),
    sport: WATCH_SPORT.optional(),
  }),
};

export const WATCH_ALARM_TOOL = {
  name: 'alarm',
  input: z.strictObject({
    device: DEVICE,
    time: WATCH_ALARM.shape.time,
    days: WATCH_ALARM.shape.days.optional(),
    enabled: z.boolean().optional(),
  }),
};

export const WATCH_FACE_TOOL = {
  name: 'face',
  input: z.strictObject({ device: DEVICE, face: z.string().min(1) }),
};

function choiceOf<V extends string>(ids: readonly V[], label: (id: V) => string): PortKind<V> {
  return { type: { t: 'choice', options: ids.map((id) => ({ id, label: label(id) })) } };
}

const WATCH: PortKind<string> = {
  type: { t: 'ref', of: 'device', families: [...WATCH_FAMILIES] },
};

const ACTION = choiceOf(WATCH_NODE_ACTIONS, (id) => ACTION_LABELS[id]);

const SPORT: PortKind<WatchSport> = choiceOf(WATCH_SPORT.options, (id) => WATCH_SPORT_LABELS[id]);

const DAY = choiceOf(DAY_IDS, (id) => DAY_LABELS[id]);

const TIME_OF_DAY: PortKind<string> = { type: { t: 'timeOfDay' } };

const FACE = entity(WATCH_AUTOMATION_ID, {
  id: 'face',
  title: 'Watch face',
  plural: 'Watch faces',
  options: WATCH_FACE_PICKER,
});

const COMMAND_TIMEOUT = { default: ANSWER_TIMEOUT_MS, max: ANSWER_TIMEOUT_MS } as const;

const COMMAND_ERRORS = {
  [WATCH_ERROR_CODES.unreachable]: 'Unreachable',
  [WATCH_ERROR_CODES.unanswered]: 'Timeout',
  [WATCH_ERROR_CODES.refused]: 'Refused',
  [WATCH_ERROR_CODES.notFound]: 'NotFound',
} as const;

const WATCH_ACTION_NODE = actionNode({
  id: 'action',
  version: 1,
  title: 'Watch action',
  description:
    'Makes the watch ring so it can be found, syncs it, or starts, pauses, resumes or stops a workout on it.',
  icon: 'watch',
  keywords: ['watch', 'find my watch', 'sync', 'workout', 'xiaomi', 'band'],
  summary: '{action} on {watch} {sport}',
  tool: WATCH_ACTION_TOOL,
  inputs: {
    watch: input(WATCH, { title: 'Watch', description: 'The watch to act on.' }),
    action: input(ACTION, { title: 'Action', description: 'What the watch should do.' }),
    sport: optionalInput(SPORT, {
      title: 'Sport',
      description: 'The kind of workout to start. Only used when starting a workout.',
    }),
  },
  outputs: {
    detail: output(ports.text(), {
      title: 'What the watch reported',
      description: 'The answer of the watch once the action is done.',
      from: '/detail',
    }),
  },
  args: { device: { port: 'watch' }, action: { port: 'action' }, sport: { port: 'sport' } },
  waitOnly: ['detail'],
  timeout: COMMAND_TIMEOUT,
  errors: COMMAND_ERRORS,
});

const WATCH_ALARM_NODE = actionNode({
  id: 'alarm',
  version: 1,
  title: 'Set a watch alarm',
  description:
    'Sets the watch alarm at a time of day: adds it, or changes the one already at that time. No days means it rings once.',
  icon: 'alarmClock',
  keywords: ['watch', 'alarm', 'wake', 'smart alarm', 'xiaomi', 'band'],
  summary: 'Alarm on {watch} at {time} {days} {on}',
  tool: WATCH_ALARM_TOOL,
  inputs: {
    watch: input(WATCH, { title: 'Watch', description: 'The watch that rings.' }),
    time: input(TIME_OF_DAY, { title: 'Time', description: 'When the alarm rings.' }),
    days: optionalInput(ports.list(DAY), {
      title: 'Days',
      description: 'The days it rings. Leave empty to ring once.',
      default: [],
    }),
    on: optionalInput(ports.boolean(), {
      title: 'On',
      description: 'Whether the alarm is switched on.',
      default: true,
    }),
  },
  args: {
    device: { port: 'watch' },
    time: { port: 'time' },
    days: { port: 'days' },
    enabled: { port: 'on' },
  },
  timeout: COMMAND_TIMEOUT,
  errors: COMMAND_ERRORS,
  retry: 'idempotent',
});

const WATCH_FACE_NODE = actionNode({
  id: 'face',
  version: 1,
  title: 'Change the watch face',
  description: 'Puts a watch face from the watch on its screen.',
  icon: 'watch',
  keywords: ['watch', 'face', 'dial', 'theme', 'xiaomi', 'band'],
  summary: 'Show {face} on {watch}',
  tool: WATCH_FACE_TOOL,
  inputs: {
    watch: input(WATCH, { title: 'Watch', description: 'The watch whose face changes.' }),
    face: input(FACE.kind, { title: 'Face', description: 'The face to show.' }),
  },
  args: { device: { port: 'watch' }, face: { port: 'face' } },
  timeout: COMMAND_TIMEOUT,
  errors: COMMAND_ERRORS,
  retry: 'idempotent',
});

export const WATCH_AUTOMATION: DriverAutomationInput = {
  id: WATCH_AUTOMATION_ID,
  name: 'Watch',
  icon: 'watch',
  version: '1.0.0',
  automation: automation({
    nodes: [WATCH_ACTION_NODE, WATCH_ALARM_NODE, WATCH_FACE_NODE],
    entities: [FACE],
  }),
};

export function registerWatchAutomation(
  catalog: Pick<PluginKindCatalog, 'replace' | 'remove' | 'driverNodes'>,
  runtime: DriverRuntime,
): () => void {
  const stopKinds = registerDriverAutomation(catalog, WATCH_AUTOMATION);
  const stopNodes = catalog.driverNodes.register(
    WATCH_AUTOMATION_ID,
    PLUGIN_AUTOMATION.parse(WATCH_AUTOMATION.automation),
    runtime,
  );
  return (): void => {
    stopNodes();
    stopKinds();
  };
}

export function watchFaceOptions(faces: readonly WatchFace[]): readonly PluginOption[] {
  const byId = new Map(faces.map((face) => [face.id, face]));
  return [...byId.values()].map((face) => ({
    id: face.id,
    label: face.name,
    detail: face.active ? 'Showing now' : null,
    color: null,
    image: null,
  }));
}
