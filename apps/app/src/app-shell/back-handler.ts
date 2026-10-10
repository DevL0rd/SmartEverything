import { useEffect, useEffectEvent } from 'react';
import { BackHandler } from 'react-native';
import { isNative } from '../design/platform';
import { navSheetPhase } from './nav-sheet-state';

export interface BackTarget {
  readonly atTabRoot: boolean;
  readonly onHome: boolean;
  readonly goHome: () => void;
}

interface NestedState {
  readonly type?: string;
  readonly index?: number;
  readonly routes: readonly { readonly state?: NestedState | undefined }[];
}

export function atStackRoot(state: NestedState | undefined): boolean {
  let level = state;
  while (level !== undefined) {
    const index = level.index ?? 0;
    if (level.type !== 'tab' && index > 0) {
      return false;
    }
    level = level.routes[index]?.state;
  }
  return true;
}

export function useTabRootBack(target: BackTarget): void {
  const onBack = useEffectEvent((): boolean => {
    const { atTabRoot, onHome, goHome } = target;
    if (navSheetPhase.get() !== 'closed' || !atTabRoot || onHome) {
      return false;
    }
    goHome();
    return true;
  });
  useEffect(() => {
    if (!isNative()) {
      return undefined;
    }
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => onBack());
    return (): void => {
      subscription.remove();
    };
  }, []);
}
