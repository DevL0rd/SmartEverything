import type { RobotMoves, RobotStatus } from '@smarteverything/domain';
import { useMemo } from 'react';
import {
  robotFactsOf,
  robotMood,
  useDeviceVisualState,
  type VisualState,
} from '../../features/device-visuals';
import type { Device } from '../../store/state';
import { robotDay, type RobotDay } from './activity-timeline';
import { robotProblem, useRobotActivity, useRobotMoves, useRobotStatus } from './aibi-data';
import { robotView, type RobotView } from './robot-model';

export interface RobotLive {
  readonly status: RobotStatus;
  readonly state: VisualState;
  readonly view: RobotView;
  readonly day: RobotDay;
  readonly moves: RobotMoves | null;
}

const NO_ENTRIES: readonly never[] = [];

export function useRobotLive(device: Device): RobotLive | null {
  const base = useDeviceVisualState(device);
  const status = useRobotStatus();
  const activity = useRobotActivity();
  const moves = useRobotMoves();
  const entries = activity.state === 'ready' ? activity.value.entries : NO_ENTRIES;
  const stamp = activity.state === 'ready' ? Date.parse(activity.at) : null;
  const statusValue = status.state === 'ready' ? status.value : null;
  const movesValue = moves.state === 'ready' ? moves.value : null;
  return useMemo(() => {
    if (statusValue === null) {
      return null;
    }
    const mood = robotMood(statusValue, {
      online: base.online,
      trouble: robotProblem(statusValue) !== null,
    });
    const facts = robotFactsOf(statusValue, entries, mood);
    return {
      status: statusValue,
      state: { ...base, robot: facts },
      view: robotView(statusValue, facts.mood, facts.onBase),
      day: robotDay(entries, stamp ?? Date.parse(statusValue.updatedAt)),
      moves: movesValue,
    };
  }, [base, statusValue, entries, stamp, movesValue]);
}
