import { rememberBrowserFocus, restoreBrowserFocus } from '../../../platform/browser-focus';
import { useEffect, useState } from 'react';
import { BackHandler, Platform } from 'react-native';
import { router, useLocalSearchParams, useIsFocused } from 'expo-router';
import { setLocalPref, useLocalPref } from '../../../store/local-prefs';

export const BROWSER_MIN_WIDTH = 560;
const CHAT_MIN_WIDTH = 560;
const DOCK_AT = BROWSER_MIN_WIDTH + CHAT_MIN_WIDTH;
export interface PanelState {
  readonly docked: boolean;
  readonly open: boolean;
  readonly toggle: () => void;
  readonly show: () => void;
  readonly hide: () => void;
  readonly measure: (width: number) => void;
}
export function usePanelState(): PanelState {
  const open = useLocalPref('chatPanelOpen');
  const focused = useIsFocused();
  const [width, measure] = useState<number | null>(null);
  const { section } = useLocalSearchParams<{ section?: string }>();
  const show = (): void => {
    rememberBrowserFocus('pane');
    setLocalPref('chatPanelOpen', true);
  };
  const hide = (): void => {
    setLocalPref('chatPanelOpen', false);
    restoreBrowserFocus('pane');
  };
  useEffect(() => {
    if (section !== 'browser' || !focused) return;
    setLocalPref('chatPanelOpen', true);
    router.setParams({ section: undefined, sheet: undefined });
  }, [section, focused]);
  useEffect(() => {
    if (Platform.OS !== 'android' || !focused || !open) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      setLocalPref('chatPanelOpen', false);
      return true;
    });
    return (): void => {
      subscription.remove();
    };
  }, [focused, open]);
  return {
    docked: open && width !== null && width >= DOCK_AT,
    open,
    toggle: open ? hide : show,
    show,
    hide,
    measure,
  };
}
