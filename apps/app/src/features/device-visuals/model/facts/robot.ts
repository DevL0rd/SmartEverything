import type { RobotActivityEntry, RobotStatus } from '@smarteverything/domain';
import type { RobotFacts, RobotMood, VisualState } from '../../types';
import type { Decorate } from './decorate';

const NOT_ON_BASE = /not on base/i;

function lastSpoken(status: RobotStatus): RobotStatus['lines'][number] | undefined {
  return status.lines.findLast((line) => line.who !== 'note');
}

export const SPEAKING_WINDOW_MS = 60_000;

export interface RobotMoodInput {
  readonly online: boolean;
  readonly trouble: boolean;
}

export function robotMood(status: RobotStatus, { online, trouble }: RobotMoodInput): RobotMood {
  if (!online) {
    return 'asleep';
  }
  if (trouble) {
    return 'worried';
  }
  if (!status.conversation) {
    return 'awake';
  }
  const last = lastSpoken(status);
  return last?.who === 'aibi' &&
    Date.parse(status.updatedAt) - Date.parse(last.at) < SPEAKING_WINDOW_MS
    ? 'speaking'
    : 'listening';
}

export function robotOnBase(status: RobotStatus): boolean | null {
  const report = status.robot;
  return report === null ? null : !report.components.some((part) => NOT_ON_BASE.test(part));
}

export function newestMove(entries: readonly RobotActivityEntry[]): string | null {
  let newest: RobotActivityEntry | null = null;
  for (const entry of entries) {
    if (
      entry.kind === 'action' &&
      (newest === null || Date.parse(entry.at) > Date.parse(newest.at))
    ) {
      newest = entry;
    }
  }
  return newest === null ? null : newest.at;
}

export function robotFactsOf(
  status: RobotStatus,
  entries: readonly RobotActivityEntry[],
  mood: RobotMood,
): RobotFacts {
  return {
    mood,
    onBase: robotOnBase(status),
    move: newestMove(entries),
  };
}

function resting(online: boolean): RobotFacts {
  return { mood: online ? 'awake' : 'asleep', onBase: null, move: null };
}

export function robotFacts(state: VisualState): RobotFacts {
  return state.robot ?? resting(state.online);
}

export const robotState: Decorate = (base) => ({ ...base, robot: resting(base.online) });
