import { useEffect, useState, type ReactNode } from 'react';
import type { DesktopCaptureMode, DesktopOverlayHelper } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { ValueRow } from '../../../components/rows';
import { desktopBridge } from '../../../design/platform';
import { HELPER_SUBTITLE, HELPER_TITLE, helperText } from './overlay-helper';

function useOverlayHelper(): DesktopOverlayHelper | null {
  const [helper, setHelper] = useState<DesktopOverlayHelper | null>(null);
  useEffect(() => {
    const bridge = desktopBridge();
    if (bridge?.overlayHelper === undefined) {
      return undefined;
    }
    background(bridge.overlayHelper().then(setHelper), 'overlay.helper_failed');
    return bridge.onOverlayHelper?.(setHelper);
  }, []);
  return helper;
}

function usePlacedBySystem(): boolean {
  const [mode, setMode] = useState<DesktopCaptureMode | null>(null);
  useEffect(() => {
    const bridge = desktopBridge();
    if (bridge?.captureMode === undefined) {
      return;
    }
    background(bridge.captureMode().then(setMode), 'overlay.session_failed');
  }, []);
  return desktopBridge()?.platform === 'linux' && mode === 'portal';
}

export function OverlayHelperRow(): ReactNode {
  const helper = useOverlayHelper();
  const placedBySystem = usePlacedBySystem();
  return (
    <ValueRow
      title={HELPER_TITLE}
      subtitle={HELPER_SUBTITLE}
      icon="monitor"
      value={helperText(helper, placedBySystem)}
      wrapSubtitle
    />
  );
}
