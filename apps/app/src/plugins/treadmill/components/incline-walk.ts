import type { BeltState, TreadmillStateView } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { AccessibilityInfo } from 'react-native';
import { useControl, type Control } from '../../../store/control';
import { useLiveSelect } from '../data/treadmill-data';
import {
  progressLine,
  steppedIncline,
  walkAbandoned,
  walkStep,
  type InclineGate,
} from '../model/incline-model';

type ControlsGate = Extract<InclineGate, { readonly kind: 'controls' }>;

interface Goal {
  readonly target: number;
  readonly chip: boolean;
  readonly repeat: boolean;
}

type SetGoal = Dispatch<SetStateAction<Goal | null>>;

export interface InclineWalk {
  readonly progress: string | null;
  readonly stepOnce: (direction: 1 | -1) => void;
  readonly repeat: (direction: 1 | -1) => void;
  readonly release: () => void;
  readonly walkTo: (target: number) => void;
}

const SETTLE_MS = 10_000;

function useStepDriver(
  control: Control,
  position: { readonly current: number | null; readonly step: number },
  goal: Goal | null,
  setGoal: SetGoal,
): void {
  const { current, step } = position;
  const awaiting = useRef<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearTimer = (): void => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  };
  useEffect(() => clearTimer, []);
  useEffect(() => {
    if (goal === null || current === null) {
      awaiting.current = null;
      clearTimer();
      return;
    }
    if (awaiting.current !== null && awaiting.current !== current) {
      return;
    }
    awaiting.current = null;
    clearTimer();
    const next = walkStep(current, goal.target, step);
    if (next === null) {
      return;
    }
    awaiting.current = next;
    timer.current = setTimeout(() => {
      timer.current = null;
      awaiting.current = null;
      setGoal(null);
    }, SETTLE_MS);
    background(
      control.set(next).then((sent) => {
        if (!sent) {
          awaiting.current = null;
          clearTimer();
          setGoal(null);
        }
      }),
      'control.set_failed',
    );
  }, [current, goal, step, control, setGoal]);
}

function useGoalReset(
  goal: Goal | null,
  setGoal: SetGoal,
  state: BeltState,
  stopped: boolean,
): void {
  const [seen, setSeen] = useState(state);
  if (seen !== state) {
    setSeen(state);
    if (goal !== null && walkAbandoned(seen, state)) {
      setGoal(null);
    }
  }
  if (goal !== null && stopped) {
    setGoal(null);
  }
}

export function useInclineWalk(
  deviceId: string,
  view: TreadmillStateView,
  gate: ControlsGate,
): InclineWalk {
  const control = useControl(deviceId, 'belt_incline');
  const current = useLiveSelect(deviceId, view.frame, (frame) => frame.belt.inclinePercent);
  const state = useLiveSelect(deviceId, view.frame, (frame) => frame.belt.state);
  const [goal, setGoal] = useState<Goal | null>(null);
  useGoalReset(goal, setGoal, state, !gate.enabled || control.failure !== null);
  if (goal !== null && current === goal.target) {
    setGoal(null);
  }
  useStepDriver(control, { current, step: gate.range.step }, goal, setGoal);
  const progress =
    goal?.chip === true && current !== null ? progressLine(current, goal.target) : null;
  useEffect(() => {
    if (progress !== null) {
      AccessibilityInfo.announceForAccessibility(progress);
    }
  }, [progress]);
  return {
    progress,
    stepOnce: (direction): void => {
      const target = current === null ? null : steppedIncline(current, direction, gate);
      if (target !== null) {
        setGoal({ target, chip: false, repeat: false });
      }
    },
    repeat: (direction): void => {
      setGoal({
        target: direction === 1 ? gate.ceiling : gate.range.min,
        chip: false,
        repeat: true,
      });
    },
    release: (): void => {
      setGoal((held) => (held?.repeat === true ? null : held));
    },
    walkTo: (target): void => {
      setGoal({ target, chip: true, repeat: false });
    },
  };
}
