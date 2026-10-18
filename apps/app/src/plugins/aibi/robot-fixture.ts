import {
  ROBOT_ACTIVITY_ENTRY,
  ROBOT_MOVES,
  ROBOT_STATUS,
  type RobotActivityEntry,
  type RobotMoves,
  type RobotStatus,
} from '@smarteverything/domain';

export const LINES = [
  { at: '2026-10-18T10:00:00Z', who: 'user', text: 'What’s the weather?' },
  { at: '2026-10-18T10:00:02Z', who: 'aibi', text: 'Sunny and 22 degrees.' },
] as const;

export function reportOf(components: readonly string[] = []): Record<string, unknown> {
  return {
    version: '10',
    firmware: '1.7.0',
    components,
    city: null,
    country: null,
    timezone: null,
    language: null,
    name: null,
    age: null,
    updateError: null,
  };
}

export function statusOf(overrides: Record<string, unknown> = {}): RobotStatus {
  return ROBOT_STATUS.parse({
    mode: 'local',
    address: '192.168.1.5',
    server: { state: 'running', reason: null },
    dns: { state: 'running', reason: null },
    ports: { http: 80, https: 443, dns: 53 },
    contact: { at: '2026-10-18T10:00:00Z', remote: '192.168.1.9', path: '/status' },
    calls: [],
    robot: reportOf(),
    conversation: false,
    waiting: 0,
    tasks: 0,
    configured: true,
    capture: false,
    lines: [],
    updatedAt: '2026-10-18T10:00:00Z',
    ...overrides,
  });
}

export function entryOf(
  id: number,
  kind: RobotActivityEntry['kind'],
  at: string,
): RobotActivityEntry {
  return ROBOT_ACTIVITY_ENTRY.parse({ id, at, kind, title: kind, detail: '' });
}

function moveOf(id: string, options: readonly string[] = []): Record<string, unknown> {
  return {
    id,
    description: id,
    instructions: '',
    options: options.map((name) => ({ name, choices: [], rule: '' })),
  };
}

export function movesOf(): RobotMoves {
  return ROBOT_MOVES.parse({
    actions: [
      moveOf('ability_dance'),
      moveOf('ability_sing'),
      moveOf('ability_animal'),
      moveOf('ability_alarm_set', ['time']),
    ],
    animations: 12,
  });
}
