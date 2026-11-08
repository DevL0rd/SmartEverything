import { AppState } from 'react-native';
import { useEffect } from 'react';
import { useValue } from '../../../design/external-store';
import { localLibrary } from './store';
import { localMediaSource } from './source';
import type { LocalLibraryState } from './types';
import { watchLocalLibrary, type LocalLibraryWatch } from './watch';

export interface LocalLibraryView extends LocalLibraryState {
  requestAccess(): Promise<void>;
  retry(): void;
}

let active: LocalLibraryWatch | null = null;
let readers = 0;
let appOff: (() => void) | null = null;

function acquire(): () => void {
  readers += 1;
  if (active === null) {
    const source = localMediaSource();
    if (source === null) {
      localLibrary.set({ state: 'unavailable', access: 'none', items: [], error: null });
    } else {
      active = watchLocalLibrary(source);
      const app = AppState.addEventListener('change', (next) => {
        if (next === 'active') active?.refresh();
      });
      appOff = (): void => {
        app.remove();
      };
    }
  }
  return (): void => {
    readers -= 1;
    if (readers > 0) return;
    active?.stop();
    active = null;
    appOff?.();
    appOff = null;
  };
}

export function useLocalLibrary(): LocalLibraryView {
  const state = useValue(localLibrary);
  useEffect(acquire, []);
  return {
    ...state,
    requestAccess: async (): Promise<void> => {
      await active?.requestAccess();
    },
    retry: (): void => {
      active?.refresh();
    },
  };
}
