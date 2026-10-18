import { useEffect } from 'react';
import { AppState } from 'react-native';
import { usePathname } from 'expo-router';
import type { OverlaySurface } from '@smarteverything/domain';
import { ValueStore } from '../../../design/external-store';
import { appPlatform, desktopBridge, isNative } from '../../../design/platform';
import { useLocalPref } from '../../../store/local-prefs';
import { callActive, type CallView } from '../call/call-state';

export const CALL_PATH = '/assistant/call';

export interface SurfaceFacts {
  readonly focused: boolean;
  readonly visible: boolean;
  readonly foreground: boolean;
  readonly pathname: string;
}

const NO_FACTS: SurfaceFacts = { focused: false, visible: false, foreground: true, pathname: '' };

export const surfaceFacts = new ValueStore<SurfaceFacts>(NO_FACTS);

export function inShareOf(call: CallView): boolean {
  return callActive(call) && call.sight?.source === 'desktop_screen';
}

function mainOf(facts: SurfaceFacts): 'call' | 'other' | 'away' {
  if (!facts.focused || !facts.visible) {
    return 'away';
  }
  return facts.pathname === CALL_PATH ? 'call' : 'other';
}

export function surfaceOf(
  platform: 'desktop' | 'phone',
  facts: SurfaceFacts,
  inShare: boolean,
): OverlaySurface {
  return platform === 'phone'
    ? { platform, foreground: facts.foreground }
    : { platform, main: mainOf(facts), inShare };
}

function changeFacts(change: Partial<SurfaceFacts>): void {
  surfaceFacts.update((facts) => ({ ...facts, ...change }));
}

function watchWindow(): () => void {
  const read = (): void => {
    changeFacts({ focused: document.hasFocus(), visible: document.visibilityState === 'visible' });
  };
  read();
  window.addEventListener('focus', read);
  window.addEventListener('blur', read);
  document.addEventListener('visibilitychange', read);
  return (): void => {
    window.removeEventListener('focus', read);
    window.removeEventListener('blur', read);
    document.removeEventListener('visibilitychange', read);
  };
}

function watchApp(): () => void {
  changeFacts({ foreground: AppState.currentState === 'active' });
  const subscription = AppState.addEventListener('change', (state) => {
    changeFacts({ foreground: state === 'active' });
  });
  return (): void => {
    subscription.remove();
  };
}

function watchSurface(): () => void {
  return isNative() ? watchApp() : watchWindow();
}

export function useSurfaceEvents(): void {
  const pathname = usePathname();
  useEffect(() => watchSurface(), []);
  useEffect(() => {
    changeFacts({ pathname });
  }, [pathname]);
}

export function overlayPlatform(): 'desktop' | 'phone' | null {
  const platform = appPlatform();
  if (platform === 'android') {
    return 'phone';
  }
  return platform === 'desktop' ? 'desktop' : null;
}

export function desktopOverlayOn(
  enabled: boolean,
  bridge: { readonly setOverlay?: unknown } | null,
): boolean {
  return enabled && bridge?.setOverlay !== undefined;
}

export function useDesktopOverlayOn(): boolean {
  return desktopOverlayOn(useLocalPref('overlay').enabled, desktopBridge());
}
