import { useEffect, useState } from 'react';
import type { DesktopCaptureMode, DesktopCaptureSource } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { desktopBridge } from '../../../../design/platform';
import { rawErrorText } from '../../../../format/errors';

const log = new Logger('app.assistant-call');

export type CaptureSources =
  | { readonly status: 'loading' }
  | {
      readonly status: 'ready';
      readonly mode: DesktopCaptureMode | null;
      readonly sources: readonly DesktopCaptureSource[];
    }
  | { readonly status: 'failed'; readonly reason: string };

const NO_BRIDGE: CaptureSources = { status: 'ready', mode: null, sources: [] };

async function load(): Promise<CaptureSources> {
  const bridge = desktopBridge();
  const mode = (await bridge?.captureMode?.()) ?? null;
  if (mode !== 'picker') {
    return { status: 'ready', mode, sources: [] };
  }
  const sources = (await bridge?.listCaptureSources?.()) ?? [];
  return { status: 'ready', mode, sources };
}

export function useCaptureSources(active: boolean): CaptureSources {
  const [loaded, setLoaded] = useState<CaptureSources | null>(null);
  useEffect(() => {
    if (!active || desktopBridge() === null) {
      return undefined;
    }
    let current = true;
    load().then(
      (found) => {
        if (current) {
          setLoaded(found);
        }
      },
      (error: unknown) => {
        log.warn('call.capture_sources_failed', { reason: rawErrorText(error) });
        if (current) {
          setLoaded({ status: 'failed', reason: rawErrorText(error) });
        }
      },
    );
    return (): void => {
      current = false;
      setLoaded(null);
    };
  }, [active]);
  if (desktopBridge() === null) {
    return NO_BRIDGE;
  }
  return loaded ?? { status: 'loading' };
}

export function useCaptureMode(): DesktopCaptureMode | null {
  const [mode, setMode] = useState<DesktopCaptureMode | null>(null);
  useEffect(() => {
    const bridge = desktopBridge();
    if (bridge?.captureMode === undefined) {
      return undefined;
    }
    let current = true;
    bridge.captureMode().then(
      (found) => {
        if (current) {
          setMode(found);
        }
      },
      (error: unknown) => {
        log.warn('call.capture_mode_failed', { reason: rawErrorText(error) });
      },
    );
    return (): void => {
      current = false;
    };
  }, []);
  return mode;
}
