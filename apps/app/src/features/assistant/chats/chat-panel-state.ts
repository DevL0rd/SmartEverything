import { rememberBrowserFocus, restoreBrowserFocus } from '../../../platform/browser-focus';
import { useEffect, useState, type RefObject } from 'react';
import { BackHandler, Platform, type View } from 'react-native';
import { router, useLocalSearchParams, useIsFocused } from 'expo-router';
import { WIDTH_BREAKPOINTS } from '../../../design/size-class';
import { setLocalPref, useLocalPref } from '../../../store/local-prefs';

export interface PanelState {
  readonly docked: boolean;
  readonly open: boolean;
  readonly toggle: () => void;
  readonly show: () => void;
  readonly hide: () => void;
  readonly measure: (width: number) => void;
}
export function usePanelState(toggleRef?: RefObject<View | null>): PanelState {
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
    restoreBrowserFocus('pane', () => toggleRef?.current);
  };
  useEffect(() => {
    if (section !== 'browser' || !focused) return;
    setLocalPref('chatPanelOpen', true);
    router.setParams({ section: undefined });
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
    docked: open && width !== null && width >= WIDTH_BREAKPOINTS.expanded,
    open,
    toggle: open ? hide : show,
    show,
    hide,
    measure,
  };
}
