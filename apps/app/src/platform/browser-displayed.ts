import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { useValue } from '../design/external-store';
import { browserCovered } from './browser-overlays';
export function useBrowserDisplayed(visible: boolean): boolean {
  const covered = useValue(browserCovered);
  const [active, setActive] = useState(AppState.currentState === 'active');
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      setActive(state === 'active');
    });
    return (): void => {
      subscription.remove();
    };
  }, []);
  return visible && !covered && active;
}
