import { z } from 'zod';

export const ROBOT_PLUGIN_ID = 'aibi';

export const ROBOT_STATUS_STREAM = 'aibi.status';

export const ROBOT_ACTIVITY_STREAM = 'aibi.activity';

export const ROBOT_MOVES_STREAM = 'aibi.moves';

export const ROBOT_DRIVER_ID = 'aibi';

export const ROBOT_ACTION_CAPABILITY = 'raw:aibi_action';

export const ROBOT_MODES = ['local', 'passthrough'] as const;

export type RobotMode = (typeof ROBOT_MODES)[number];

export const ROBOT_LISTENER_STATES = ['off', 'starting', 'running', 'failed'] as const;

const MOMENT = z.iso.datetime({ offset: true });

const COUNT = z.number().int().nonnegative();

const LISTENER = z.strictObject({
  state: z.enum(ROBOT_LISTENER_STATES),
  reason: z.string().max(400).nullable(),
});

export const ROBOT_REPORT = z.strictObject({
  version: z.string().max(80).nullable(),
  firmware: z.string().max(80).nullable(),
  components: z.array(z.string().max(80)).max(3),
  city: z.string().max(80).nullable(),
  country: z.string().max(80).nullable(),
  timezone: z.string().max(80).nullable(),
  language: z.string().max(80).nullable(),
  name: z.string().max(80).nullable(),
  age: z.string().max(80).nullable(),
  updateError: z.string().max(80).nullable(),
});

export type RobotReport = z.output<typeof ROBOT_REPORT>;

export const ROBOT_LINE_WHOS = ['user', 'aibi', 'note'] as const;

export const ROBOT_LINE = z.strictObject({
  at: MOMENT,
  who: z.enum(ROBOT_LINE_WHOS),
  text: z.string().max(400),
});

export type RobotLine = z.output<typeof ROBOT_LINE>;

export const ROBOT_STATUS = z.strictObject({
  mode: z.enum(ROBOT_MODES),
  address: z.string().max(45).nullable(),
  server: LISTENER,
  dns: LISTENER,
  ports: z.strictObject({ http: COUNT, https: COUNT, dns: COUNT }),
  contact: z
    .strictObject({ at: MOMENT, remote: z.string().max(60), path: z.string().max(200) })
    .nullable(),
  calls: z.array(z.strictObject({ path: z.string().max(200), count: COUNT, last: MOMENT })).max(12),
  robot: ROBOT_REPORT.nullable(),
  conversation: z.boolean(),
  waiting: COUNT,
  tasks: COUNT,
  configured: z.boolean(),
  capture: z.boolean(),
  lines: z.array(ROBOT_LINE).max(8),
  updatedAt: MOMENT,
});

export type RobotStatus = z.output<typeof ROBOT_STATUS>;

export const ROBOT_ACTIVITY_KINDS = [
  'heard',
  'said',
  'action',
  'chat',
  'task',
  'status',
  'request',
  'unknown',
  'firmware',
  'network',
  'warning',
] as const;

export const ROBOT_ACTIVITY_ENTRY = z.strictObject({
  id: COUNT,
  at: MOMENT,
  kind: z.enum(ROBOT_ACTIVITY_KINDS),
  title: z.string().max(200),
  detail: z.string().max(2000),
});

export type RobotActivityEntry = z.output<typeof ROBOT_ACTIVITY_ENTRY>;

export const ROBOT_ACTIVITY = z.strictObject({
  entries: z.array(ROBOT_ACTIVITY_ENTRY).max(30),
});

export const ROBOT_MOVE = z.strictObject({
  id: z.string().min(1).max(80),
  description: z.string().max(300),
  instructions: z.string().max(600),
  options: z.array(
    z.strictObject({
      name: z.string().min(1).max(60),
      choices: z.array(z.string().max(60)).max(60),
      rule: z.string().max(60),
    }),
  ),
});

export type RobotMove = z.output<typeof ROBOT_MOVE>;

export const ROBOT_MOVES = z.strictObject({
  actions: z.array(ROBOT_MOVE).max(200),
  animations: COUNT,
});

export type RobotMoves = z.output<typeof ROBOT_MOVES>;

const MOVE_PREFIX = /^(?:ability|interact|function|behavior)_/;

export function robotMoveLabel(id: string): string {
  const words = id.replace(MOVE_PREFIX, '').replaceAll('_', ' ').trim();
  return words === '' ? id : `${words.charAt(0).toUpperCase()}${words.slice(1)}`;
}
