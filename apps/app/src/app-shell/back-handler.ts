import { useEffect, useEffectEvent } from 'react';
import { BackHandler } from 'react-native';
import { Logger } from '@smarteverything/logging';
import { isNative } from '../design/platform';
import { navSheetPhase } from './nav-sheet-state';

const log = new Logger('app.nav');

export interface BackTarget {
  readonly atTabRoot: boolean;
  readonly onHome: boolean;
  readonly goHome: () => void;
}

interface NestedState {
  readonly index?: number;
  readonly routes: readonly { readonly state?: NestedState | undefined }[];
}

export function atStackRoot(state: NestedState | undefined): boolean {
  let level = state;
  while (level !== undefined) {
    const index = level.index ?? 0;
    if (index > 0) {
      return false;
    }
    level = level.routes[index]?.state;
  }
  return true;
}

export function useTabRootBack(target: BackTarget): void {
  const onBack = useEffectEvent((): boolean => {
    const { atTabRoot, onHome, goHome } = target;
    const sheet = navSheetPhase.get();
    if (sheet !== 'closed' || !atTabRoot || onHome) {
      log.debug('back.passed', { sheet, atTabRoot, onHome });
      return false;
    }
    log.info('back.went_home');
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
