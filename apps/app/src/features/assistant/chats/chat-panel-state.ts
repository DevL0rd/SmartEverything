import { useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { setLocalPref, useLocalPref } from '../../../store/local-prefs';
import { useIdiom } from '../../../design/platform';

const INSPECTOR_WIDTH = 420;

const THREAD_MIN_WIDTH = 560;

const DOCK_AT = INSPECTOR_WIDTH + THREAD_MIN_WIDTH;

export interface PanelState {
  readonly docked: boolean;
  readonly overlay: boolean;
  readonly open: boolean;
  readonly toggle: () => void;
  readonly show: () => void;
  readonly hide: () => void;
  readonly measure: (width: number) => void;
}

export function usePanelState(): PanelState {
  const pointer = useIdiom() === 'pointer';
  const pinned = useLocalPref('chatPanelOpen');
  const [width, setWidth] = useState(0);
  const [overlay, setOverlay] = useState(false);
  const canDock = pointer && width >= DOCK_AT;
  const docked = canDock && pinned;
  const show = (): void => {
    if (canDock) {
      setLocalPref('chatPanelOpen', true);
    } else {
      setOverlay(true);
    }
  };
  const hide = (): void => {
    setLocalPref('chatPanelOpen', false);
    setOverlay(false);
  };
  const open = docked || overlay;
  const { sheet } = useLocalSearchParams<{ sheet?: string }>();
  const [handled, setHandled] = useState<string | undefined>(undefined);
  if (sheet !== handled) {
    setHandled(sheet);
    if (sheet === 'chat') {
      setOverlay(true);
    }
  }
  useEffect(() => {
    if (sheet === 'chat') {
      router.setParams({ sheet: undefined });
    }
  }, [sheet]);
  return {
    docked,
    overlay,
    open,
    toggle: open ? hide : show,
    show,
    hide,
    measure: setWidth,
  };
}
