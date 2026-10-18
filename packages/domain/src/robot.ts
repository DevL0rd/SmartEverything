import { z } from 'zod';
import { humanizeKey } from './presentation/humanize';

export const ROBOT_PLUGIN_ID = 'aibi';

export const ROBOT_STATUS_STREAM = 'aibi.status';

export const ROBOT_ACTIVITY_STREAM = 'aibi.activity';

export const ROBOT_MOVES_STREAM = 'aibi.moves';

export const ROBOT_DRIVER_ID = 'aibi';

export const ROBOT_ACTION_CAPABILITY = 'raw:aibi_action';

export const ROBOT_ONLINE_WINDOW_MS = 5 * 60_000;

export const ROBOT_MODES = ['local', 'passthrough'] as const;

export type RobotMode = (typeof ROBOT_MODES)[number];

export const ROBOT_LISTENER_STATES = ['off', 'starting', 'running', 'failed'] as const;

const MOMENT = z.iso.datetime({ offset: true });

const COUNT = z.number().int().nonnegative();

const LISTENER = z.object({
  state: z.enum(ROBOT_LISTENER_STATES),
  reason: z.string().nullable(),
});

export const ROBOT_REPORT = z.object({
  version: z.string().nullable(),
  firmware: z.string().nullable(),
  components: z.array(z.string()),
  city: z.string().nullable(),
  country: z.string().nullable(),
  timezone: z.string().nullable(),
  language: z.string().nullable(),
  name: z.string().nullable(),
  age: z.string().nullable(),
  updateError: z.string().nullable(),
});

export type RobotReport = z.output<typeof ROBOT_REPORT>;

export const ROBOT_LINE_WHOS = ['user', 'aibi', 'note'] as const;

export const ROBOT_LINE = z.object({
  at: MOMENT,
  who: z.enum(ROBOT_LINE_WHOS),
  text: z.string(),
});

export type RobotLine = z.output<typeof ROBOT_LINE>;

export const ROBOT_STATUS = z.object({
  mode: z.enum(ROBOT_MODES),
  address: z.string().nullable(),
  server: LISTENER,
  dns: LISTENER,
  ports: z.object({ http: COUNT, https: COUNT, dns: COUNT }),
  contact: z.object({ at: MOMENT, remote: z.string(), path: z.string() }).nullable(),
  calls: z.array(z.object({ path: z.string(), count: COUNT, last: MOMENT })),
  robot: ROBOT_REPORT.nullable(),
  conversation: z.boolean(),
  waiting: COUNT,
  tasks: COUNT,
  configured: z.boolean(),
  capture: z.boolean(),
  lines: z.array(ROBOT_LINE),
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

export const ROBOT_ACTIVITY_ENTRY = z.object({
  id: COUNT,
  at: MOMENT,
  kind: z.enum(ROBOT_ACTIVITY_KINDS),
  title: z.string(),
  detail: z.string(),
});

export type RobotActivityEntry = z.output<typeof ROBOT_ACTIVITY_ENTRY>;

export const ROBOT_ACTIVITY = z.object({
  entries: z.array(ROBOT_ACTIVITY_ENTRY),
});

export const ROBOT_MOVE = z.object({
  id: z.string().min(1),
  description: z.string(),
  instructions: z.string(),
  options: z.array(
    z.object({
      name: z.string().min(1),
      choices: z.array(z.string()),
      rule: z.string(),
    }),
  ),
});

export type RobotMove = z.output<typeof ROBOT_MOVE>;

export const ROBOT_MOVES = z.object({
  actions: z.array(ROBOT_MOVE),
  animations: COUNT,
});

export type RobotMoves = z.output<typeof ROBOT_MOVES>;

const MOVE_PREFIX = /^(?:ability|interact|function|behavior)_/;

export function robotMoveLabel(id: string): string {
  return humanizeKey(id.replace(MOVE_PREFIX, ''));
}
