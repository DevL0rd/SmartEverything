import type { ReactNode } from 'react';
import { View } from 'react-native';
import { CanvasHost } from '../host/canvas-host';
import { dropGhostOf } from '../palette/armed-insert';
import { CanvasControls } from './canvas-controls';
import type { EditorModel } from './use-editor-model';
import { SelectionPill } from './selection-mode';

function CanvasView({ model }: { readonly model: EditorModel }): ReactNode {
  const { props: screen, actions, viewport, check } = model;
  return (
    <View className="min-h-0 flex-1 flex-row">
      <View className="relative min-h-0 min-w-0 flex-1">
        <CanvasHost
          store={screen.store}
          options={screen.options}
          problems={check.scene}
          check={screen.lint}
          run={screen.run}
          focusNode={model.focusNode}
          viewportCommand={viewport.command}
          ghost={dropGhostOf(model.insertion.state)}
          onScreen={screen.onScreen}
          actions={actions}
        />
        {model.selection.selecting ? (
          <SelectionPill
            count={model.flags.ids.length}
            onClear={() => {
              screen.store.clearSelected();
            }}
          />
        ) : null}
        {model.touch ? <CanvasControls touch onCommand={viewport.issue} /> : null}
      </View>
      {model.touch ? null : <CanvasControls touch={false} onCommand={viewport.issue} />}
    </View>
  );
}

export function EditorBody({ model }: { readonly model: EditorModel }): ReactNode {
  return (
    <View className="relative min-h-0 flex-1">
      <CanvasView model={model} />
    </View>
  );
}
