import { useCallback, useMemo, useState } from 'react';
import type { DOMProps } from 'expo/dom';
import { Logger } from '@smarteverything/logging';

const log = new Logger('app.automations');

const FILL = { flex: 1 } as const;

export interface CanvasFrame {
  readonly generation: number;
  readonly dom: DOMProps;
}

export function useCanvasFrame(): CanvasFrame {
  const [generation, setGeneration] = useState(0);
  const remount = useCallback((cause: string): void => {
    log.warn('canvas.webview_lost', { cause });
    setGeneration((current) => current + 1);
  }, []);
  const dom = useMemo(
    (): DOMProps => ({
      style: FILL,
      onContentProcessDidTerminate: (): void => {
        remount('content_process_terminated');
      },
      onRenderProcessGone: (): void => {
        remount('render_process_gone');
      },
    }),
    [remount],
  );
  return { generation, dom };
}
