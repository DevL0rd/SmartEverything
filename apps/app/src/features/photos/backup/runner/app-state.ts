import { AppState } from 'react-native';
import type { AppStateSource } from './triggers';

export const appStateSource: AppStateSource = {
  subscribe(listener): () => void {
    const subscription = AppState.addEventListener('change', (state) => {
      listener(state === 'active');
    });
    return (): void => {
      subscription.remove();
    };
  },
};

export function backupAppIsActive(): boolean {
  return AppState.currentState === 'active';
}
