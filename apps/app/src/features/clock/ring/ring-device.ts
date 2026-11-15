import { Logger, background } from '@smarteverything/logging';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import {
  addPlannerEventListener,
  dismissRing,
  plannerLinked,
  requestStepCounterPermission,
  ringStatus,
  snoozeRing,
  startStepCount,
  stepCounterAvailable,
  stepCounterPermitted,
  stopStepCount,
  type PlannerNativeEvent,
  type RingStatus,
} from '../../../../modules/health-connect';

const log = new Logger('app.clock');

export type StepState = 'checking' | 'unavailable' | 'needs_permission' | 'refused' | 'counting';

export interface StepCount {
  readonly state: StepState;
  readonly count: number;
  readonly allow: () => void;
}

export function ringsOnThisPhone(): boolean {
  return Platform.OS === 'android' && plannerLinked();
}

function statusOf(
  event: PlannerNativeEvent,
  key: string,
  current: RingStatus | null,
): RingStatus | null {
  if (event.event === 'ring_ended') {
    return event.ringKey === key && current !== null ? { ...current, ringing: false } : current;
  }
  if (event.event !== 'ring_started' && event.event !== 'ring_playback') return current;
  if (event.ringKey !== key) return current;
  return {
    ringKey: key,
    ringing: true,
    snoozesLeft: event.snoozesLeft,
    nowPlaying: event.nowPlaying,
    safetyNet: event.safetyNet,
  };
}

export function usePhoneRing(key: string | null): RingStatus | null {
  const [status, setStatus] = useState<RingStatus | null>(null);
  const watched = ringsOnThisPhone() ? key : null;
  useEffect(() => {
    if (watched === null) return undefined;
    const subscription = addPlannerEventListener((event) => {
      setStatus((current) => statusOf(event, watched, current));
    });
    background(ringStatus(watched).then(setStatus), 'clock.ring_status_failed');
    return (): void => {
      subscription.remove();
    };
  }, [watched]);
  return watched === null || status?.ringKey !== watched ? null : status;
}

export function snoozeOnPhone(key: string, minutes: number | null): Promise<void> {
  log.info('ring.snoozed_on_phone', { key });
  return snoozeRing(key, minutes);
}

export function stopOnPhone(key: string): Promise<void> {
  log.info('ring.stopped_on_phone', { key });
  return dismissRing(key);
}

async function firstStepState(): Promise<StepState> {
  if (!(await stepCounterAvailable())) return 'unavailable';
  return (await stepCounterPermitted()) ? 'counting' : 'needs_permission';
}

export function useStepCount(active: boolean): StepCount {
  const [state, setState] = useState<StepState>('checking');
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!active) return undefined;
    background(firstStepState().then(setState), 'clock.steps_check_failed');
    return undefined;
  }, [active]);
  const counting = active && state === 'counting';
  useEffect(() => {
    if (!counting) return undefined;
    const subscription = addPlannerEventListener((event) => {
      if (event.event === 'steps') setCount(event.count);
    });
    background(startStepCount(), 'clock.steps_start_failed');
    return (): void => {
      subscription.remove();
      background(stopStepCount(), 'clock.steps_stop_failed');
    };
  }, [counting]);
  const allow = (): void => {
    background(
      requestStepCounterPermission().then((granted) => {
        log.info('ring.steps_permission', { granted });
        setState(granted ? 'counting' : 'refused');
      }),
      'clock.steps_permission_failed',
    );
  };
  return { state, count, allow };
}
