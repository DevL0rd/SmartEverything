import { ROBOT_ACTIVITY_ENTRY, ROBOT_STATUS } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import type { VisualState } from '../../types';
import { visualStateOf } from '../visual-state';
import {
  SPEAKING_WINDOW_MS,
  newestMove,
  robotFacts,
  robotFactsOf,
  robotMood,
  robotOnBase,
  type RobotMoodInput,
} from './robot';

function statusOf(overrides: Record<string, unknown> = {}): ReturnType<typeof ROBOT_STATUS.parse> {
  return ROBOT_STATUS.parse({
    mode: 'local',
    address: '192.168.1.5',
    server: { state: 'running', reason: null },
    dns: { state: 'running', reason: null },
    ports: { http: 80, https: 443, dns: 53 },
    contact: { at: '2026-10-18T10:00:00Z', remote: '192.168.1.9', path: '/status' },
    calls: [],
    robot: null,
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

function reportOf(components: readonly string[]): Record<string, unknown> {
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

function entryOf(
  id: number,
  kind: string,
  at: string,
): ReturnType<typeof ROBOT_ACTIVITY_ENTRY.parse> {
  return ROBOT_ACTIVITY_ENTRY.parse({ id, at, kind, title: kind, detail: '' });
}

const AIBI_SPOKE_AT = '2026-10-18T10:00:02Z';

const SPOKEN = [
  { at: '2026-10-18T10:00:00Z', who: 'user', text: 'What is the weather?' },
  { at: AIBI_SPOKE_AT, who: 'aibi', text: 'Sunny.' },
  { at: '2026-10-18T10:00:03Z', who: 'note', text: 'Showed the weather' },
];

const input = (overrides: Partial<RobotMoodInput> = {}): RobotMoodInput => ({
  online: true,
  trouble: false,
  ...overrides,
});

describe('the robot mood', () => {
  it('is asleep whenever the robot is offline, even mid conversation or in trouble', () => {
    expect(robotMood(statusOf({ conversation: true }), input({ online: false }))).toBe('asleep');
    expect(robotMood(statusOf(), input({ online: false, trouble: true }))).toBe('asleep');
  });

  it('is worried while its server has a problem', () => {
    expect(robotMood(statusOf({ conversation: true }), input({ trouble: true }))).toBe('worried');
  });

  it('is awake while online and not in a conversation', () => {
    expect(robotMood(statusOf(), input())).toBe('awake');
  });

  it('is listening when the last thing said in the conversation was the person', () => {
    const lines = SPOKEN.slice(0, 1);
    expect(robotMood(statusOf({ conversation: true, lines }), input())).toBe('listening');
  });

  it('is speaking right after the robot said something, ignoring what it did', () => {
    expect(robotMood(statusOf({ conversation: true, lines: SPOKEN }), input())).toBe('speaking');
  });

  it('goes back to listening once the server has reported something later than its last words', () => {
    const later = new Date(Date.parse(AIBI_SPOKE_AT) + SPEAKING_WINDOW_MS).toISOString();
    const status = statusOf({ conversation: true, lines: SPOKEN, updatedAt: later });
    expect(robotMood(status, input())).toBe('listening');
  });

  it('is listening at the start of a conversation with nothing said yet', () => {
    expect(robotMood(statusOf({ conversation: true }), input())).toBe('listening');
  });

  it('is not listening just because the server has something queued to tell it', () => {
    expect(robotMood(statusOf({ waiting: 2 }), input())).toBe('awake');
  });
});

describe('the robot base', () => {
  it('is unknown before the robot has reported', () => {
    expect(robotOnBase(statusOf())).toBeNull();
  });

  it('is off its base when the report says so', () => {
    expect(robotOnBase(statusOf({ robot: reportOf(['Not on base', 'v2']) }))).toBe(false);
  });

  it('is on its base when the report does not say otherwise', () => {
    expect(robotOnBase(statusOf({ robot: reportOf(['v2']) }))).toBe(true);
  });
});

describe('the newest move', () => {
  it('is the time of the latest action, whatever the order of the entries', () => {
    const entries = [
      entryOf(3, 'action', '2026-10-18T09:00:00Z'),
      entryOf(2, 'heard', '2026-10-18T11:00:00Z'),
      entryOf(1, 'action', '2026-10-18T08:00:00Z'),
    ];
    expect(newestMove(entries)).toBe('2026-10-18T09:00:00Z');
  });

  it('is nothing when the robot never moved', () => {
    expect(newestMove([entryOf(1, 'heard', '2026-10-18T08:00:00Z')])).toBeNull();
  });

  it('puts the facts together', () => {
    const entries = [entryOf(1, 'action', '2026-10-18T09:00:00Z')];
    expect(robotFactsOf(statusOf({ robot: reportOf([]) }), entries, 'awake')).toEqual({
      mood: 'awake',
      onBase: true,
      move: '2026-10-18T09:00:00Z',
    });
  });
});

describe('the resting robot', () => {
  function stateOf(online: boolean): VisualState {
    return visualStateOf({ kind: 'robot', model: 'aibi', online, capabilities: [] }, {});
  }

  it('is decorated from the device alone until the plugin reports', () => {
    expect(stateOf(true).robot).toEqual({ mood: 'awake', onBase: null, move: null });
  });

  it('sleeps when the device is offline', () => {
    expect(robotFacts(stateOf(false)).mood).toBe('asleep');
  });

  it('keeps what the plugin reported over the resting facts', () => {
    const reported = { mood: 'speaking', onBase: false, move: null } as const;
    expect(robotFacts({ ...stateOf(true), robot: reported })).toBe(reported);
  });
});
