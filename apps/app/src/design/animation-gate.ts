import { useIsFocused } from 'expo-router';
import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { useMotion } from './motion';

function subscribe(listener: () => void): () => void {
  const subscription = AppState.addEventListener('change', listener);
  return (): void => {
    subscription.remove();
  };
}

function foreground(): boolean {
  return AppState.currentState === 'active';
}

export function useForeground(): boolean {
  return useSyncExternalStore(subscribe, foreground, foreground);
}

export interface AnimationGate {
  readonly moving: boolean;
  readonly reduced: boolean;
}

export function useAnimationGate(wanted: boolean, onScreen: boolean): AnimationGate {
  const { reduced } = useMotion();
  const focused = useIsFocused();
  const visible = useForeground();
  return { moving: wanted && !reduced && focused && visible && onScreen, reduced };
}
