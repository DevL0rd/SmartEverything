import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';
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

export function isNative(): boolean {
  return Platform.OS !== 'web';
}

const COARSE = '(pointer: coarse)';

function coarseQuery(): MediaQueryList | null {
  if (isNative() || typeof window.matchMedia !== 'function') {
    return null;
  }
  return window.matchMedia(COARSE);
}

export function idiomNow(): Idiom {
  if (isNative()) {
    return 'touch';
  }
  return coarseQuery()?.matches === true ? 'touch' : 'pointer';
}

function subscribeIdiom(listener: () => void): () => void {
  const query = coarseQuery();
  if (query === null) {
    return (): void => undefined;
  }
  query.addEventListener('change', listener);
  return (): void => {
    query.removeEventListener('change', listener);
  };
}

export function onIdiomChange(listener: () => void): () => void {
  return subscribeIdiom(listener);
}

export function useIdiom(): Idiom {
  return useSyncExternalStore(subscribeIdiom, idiomNow, idiomNow);
}

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
