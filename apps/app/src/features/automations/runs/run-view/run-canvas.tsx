import { useCallback, useState, type ReactNode } from 'react';
import { Logger } from '@smarteverything/logging';
import { usePausable } from '../../../../design/external-store';
import { useStableCallback } from '../../../../design/use-stable-callback';
import FlowCanvas from '../../editor/canvas/flow-canvas';
import { parseIntent } from '../../editor/host/apply-intents';
import { useCanvasProps, type SceneOptions } from '../../editor/host/use-canvas-props';
import type { RunOverlay } from '../../model/canvas/contract';
import type { DocumentStore } from '../../model/editor/document-store';
import { applyReadOnly } from './read-only-intents';

const log = new Logger('app.automations');

const FILL = { flex: 1 } as const;

export interface RunCanvasProps {
  readonly store: DocumentStore;
  readonly options: SceneOptions;
  readonly overlay: RunOverlay;
  readonly focusNode: string | null;
  readonly onScreen: boolean;
  readonly onSettled: () => void;
}

export function useSelectedNode(store: DocumentStore): string | null {
  return usePausable(store.state.subscribe, () => store.state.get().selection.ids[0] ?? null);
}

export function RunCanvas(props: RunCanvasProps): ReactNode {
  const { store, onSettled } = props;
  const [generation, setGeneration] = useState(0);
  const canvas = useCanvasProps({
    store,
    options: props.options,
    run: props.overlay,
    focusNode: props.focusNode,
    viewportCommand: null,
    onScreen: props.onScreen,
  });
  const remount = useCallback((cause: string): void => {
    log.warn('run_canvas.webview_lost', { cause });
    setGeneration((current) => current + 1);
  }, []);
  const onIntent = useStableCallback((raw: unknown): Promise<void> => {
    applyReadOnly(parseIntent(raw), { store, ready: canvas.ready, settled: onSettled });
    return Promise.resolve();
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
