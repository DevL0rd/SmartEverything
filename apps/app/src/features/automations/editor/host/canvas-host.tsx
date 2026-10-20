import { useCallback, useState, type ReactNode } from 'react';
import { Logger } from '@smarteverything/logging';
import { useStableCallback } from '../../../../design/use-stable-callback';
import FlowCanvas from '../canvas/flow-canvas';
import { applyIntent, parseIntent } from './apply-intents';
import { deviceClipboard } from './clipboard-port';
import type { HostActions } from './intent-env';
import { useCanvasProps, type CanvasInput } from './use-canvas-props';

const log = new Logger('app.automations');

const FILL = { flex: 1 } as const;

export interface CanvasHostProps extends CanvasInput {
  readonly actions: HostActions;
}

export function CanvasHost(props: CanvasHostProps): ReactNode {
  const { store, actions } = props;
  const [generation, setGeneration] = useState(0);
  const canvas = useCanvasProps(props);
  const sceneNow = useStableCallback(() => canvas.scene);
  const remount = useCallback((cause: string): void => {
    log.warn('canvas.webview_lost', { cause });
    setGeneration((current) => current + 1);
  }, []);
  const onIntent = useStableCallback(async (raw: unknown): Promise<void> => {
    await applyIntent(parseIntent(raw), {
      store,
      scene: sceneNow,
      actions,
      clipboard: deviceClipboard,
      ready: canvas.ready,
    });
  });
  return (
    <FlowCanvas
      key={generation}
      {...canvas.props}
      onIntent={onIntent}
      dom={{
        style: FILL,
        onContentProcessDidTerminate: () => {
          remount('content_process_terminated');
        },
        onRenderProcessGone: () => {
          remount('render_process_gone');
        },
      }}
    />
  );
}
