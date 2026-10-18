import { useIsFocused } from 'expo-router';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { Logger } from '@smarteverything/logging';
import { LogTally } from './log-tally';
import { IdleRest, followIdle, onTouch } from './idle-rest';
import { useMotion } from './motion';
import { SharedSource } from './shared-source';

const log = new Logger('app.design');

let activeLoops = 0;
let restingIdle = 0;

const gates = new LogTally(log, 'animation.summarised', 10_000, () => ({
  activeLoops,
  restingIdle,
}));

const appState = new SharedSource((notify) => {
  const subscription = AppState.addEventListener('change', (state) => {
    log.info('foreground.changed', { appState: state, activeLoops });
    notify();
  });
  return (): void => {
    subscription.remove();
  };
});

function foreground(): boolean {
  return AppState.currentState === 'active';
}

export function useForeground(): boolean {
  return useSyncExternalStore(appState.subscribe, foreground, foreground);
}

export interface AnimationGate {
  readonly moving: boolean;
  readonly reduced: boolean;
}

export interface ScreenLive {
  readonly focused: boolean;
  readonly foreground: boolean;
}

export function useScreenLive(): ScreenLive {
  return { focused: useIsFocused(), foreground: useForeground() };
}

export function useAnimationGate(wanted: boolean, onScreen: boolean): AnimationGate {
  return useLiveAnimationGate(wanted, onScreen, useScreenLive());
}

export function useLiveAnimationGate(
  wanted: boolean,
  onScreen: boolean,
  { focused, foreground }: ScreenLive,
): AnimationGate {
  const { reduced } = useMotion();
  const moving = wanted && !reduced && focused && foreground && onScreen;
  useEffect(() => {
    if (!moving) return undefined;
    activeLoops += 1;
    gates.bump('loopsStarted');
    return (): void => {
      activeLoops -= 1;
      gates.bump('loopsStopped');
    };
  }, [moving]);
  return { moving, reduced };
}

export function useIdleRest(idle: boolean, ms: number, restart: unknown): boolean {
  const [resting, setResting] = useState(false);
  useEffect(() => {
    let counted = false;
    const controller = new IdleRest(ms, (next) => {
      if (next !== counted) {
        counted = next;
        restingIdle += next ? 1 : -1;
        gates.bump(next ? 'idleRested' : 'idleWoke');
      }
      setResting(next);
    });
    followIdle(controller, idle);
    const off = idle
      ? onTouch(() => {
          controller.wake();
        })
      : undefined;
    return (): void => {
      off?.();
      controller.cancel();
      if (counted) restingIdle -= 1;
    };
  }, [idle, ms, restart]);
  return idle && resting;
}
