import type { ReactNode } from 'react';
import { View } from 'react-native';
import { usePausable } from '../../../../design/external-store';
import { useIdiom } from '../../../../design/platform';
import { CanvasControls } from '../../editor/screen/canvas-controls';
import { useViewportCommand } from '../../editor/screen/use-editor-panels';
import { ViewCanvas } from '../../editor/host/canvas-host';
import type { RunSource, SceneOptions } from '../../editor/host/use-canvas-props';
import type { DocumentStore } from '../../model/editor/document-store';

const NO_PROBLEMS: readonly never[] = [];

export interface RunCanvasProps {
  readonly store: DocumentStore;
  readonly options: SceneOptions;
  readonly overlay: RunSource;
  readonly focusNode: string | null;
  readonly onScreen: boolean;
  readonly onSettled: () => void;
  readonly onStepPass: (nodeId: string, delta: -1 | 1) => void;
}

export function useSelectedNode(store: DocumentStore): string | null {
  return usePausable(store.state.subscribe, () => store.state.get().selection.ids[0] ?? null);
}

export function RunCanvas(props: RunCanvasProps): ReactNode {
  const { store, onSettled, onStepPass } = props;
  const viewport = useViewportCommand();
  const touch = useIdiom() === 'touch';
  const actions = {
    openNode: (id: string): void => {
      store.select(id);
    },
    stepPass: onStepPass,
    settled: onSettled,
  };
  return (
    <View className="min-h-0 flex-1 flex-row">
      <View className="relative min-h-0 min-w-0 flex-1">
        <ViewCanvas
          store={store}
          options={props.options}
          problems={NO_PROBLEMS}
          run={props.overlay}
          focusNode={props.focusNode}
          viewportCommand={viewport.command}
          ghost={null}
          onScreen={props.onScreen}
          actions={actions}
          framing="opening"
        />
      </View>
      <CanvasControls touch={touch} onCommand={viewport.issue} />
    </View>
  );
}
