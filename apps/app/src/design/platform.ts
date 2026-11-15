import { useSyncExternalStore } from 'react';
import { Dimensions, Platform } from 'react-native';
import type { Idiom } from './tokens';

export type AppPlatform = 'android' | 'desktop' | 'web';

export type DesktopBridge = NonNullable<Window['smartEverythingDesktop']>;

export function desktopBridge(): DesktopBridge | null {
  if (Platform.OS !== 'web' || typeof window.smartEverythingDesktop === 'undefined') {
    return null;
  }
  return window.smartEverythingDesktop;
}

export function appPlatform(): AppPlatform {
  if (Platform.OS !== 'web') {
    return 'android';
  }
  return desktopBridge() === null ? 'web' : 'desktop';
}

const TABLET_SHORTEST_SIDE_DP = 600;

export function handheldKind(): 'phone' | 'tablet' {
  const { width, height } = Dimensions.get('window');
  return Math.min(width, height) >= TABLET_SHORTEST_SIDE_DP ? 'tablet' : 'phone';
}

export function isNative(): boolean {
  return Platform.OS !== 'web';
}

const COARSE = '(pointer: coarse)';

let coarse: MediaQueryList | null | undefined;

function coarseQuery(): MediaQueryList | null {
  if (coarse === undefined) {
    coarse =
      isNative() || typeof window.matchMedia !== 'function' ? null : window.matchMedia(COARSE);
  }
  return coarse;
}

const idiomListeners = new Set<() => void>();

function notifyIdiom(): void {
  for (const listener of [...idiomListeners]) {
    listener();
  }
}

export function idiomNow(): Idiom {
  if (isNative()) {
    return 'touch';
  }
  return coarseQuery()?.matches === true ? 'touch' : 'pointer';
}

export function onIdiomChange(listener: () => void): () => void {
  const query = coarseQuery();
  if (query === null) {
    return (): void => undefined;
  }
  if (idiomListeners.size === 0) {
    query.addEventListener('change', notifyIdiom);
  }
  idiomListeners.add(listener);
  return (): void => {
    if (!idiomListeners.delete(listener) || idiomListeners.size > 0) {
      return;
    }
    query.removeEventListener('change', notifyIdiom);
  };
}

function useWebIdiom(): Idiom {
  return useSyncExternalStore(onIdiomChange, idiomNow, idiomNow);
}

function useTouchIdiom(): Idiom {
  return 'touch';
}

export const useIdiom: () => Idiom = isNative() ? useTouchIdiom : useWebIdiom;

export function isMacLike(): boolean {
  const bridge = desktopBridge();
  if (bridge !== null) {
    return bridge.platform === 'darwin';
  }
  return !isNative() && /Mac|iPhone|iPad/.test(window.navigator.userAgent);
}

export function modifierLabel(): string {
  return isMacLike() ? '⌘' : 'Ctrl';
}
