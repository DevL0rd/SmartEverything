import type { ReactNode } from 'react';
import { View } from 'react-native';
import { CanvasHost } from '../host/canvas-host';
import { PlacingBanner } from '../palette/palette';
import { CanvasControls } from './canvas-controls';
import type { EditorModel } from './use-editor-model';
import { SelectionPill } from './selection-mode';

function CanvasView({ model }: { readonly model: EditorModel }): ReactNode {
  const { props: screen, options, actions, viewport } = model;
  return (
    <>
      <CanvasHost
        store={screen.store}
        options={options}
        run={screen.run}
        focusNode={model.focusNode}
        viewportCommand={viewport.command}
        onScreen={screen.onScreen}
        actions={actions}
      />
      <CanvasControls touch={model.touch} onCommand={viewport.issue} />
      {model.selection.selecting ? (
        <SelectionPill
          count={model.flags.ids.length}
          onClear={() => {
            screen.store.clearSelected();
          }}
        />
      ) : null}
    </>
  );
}

export function EditorBody({ model }: { readonly model: EditorModel }): ReactNode {
  return (
    <View className="relative min-h-0 flex-1">
      <CanvasView model={model} />
      <View className="absolute inset-x-3 top-3 z-10" pointerEvents="box-none">
        <PlacingBanner state={model.insertion.state} onCancel={model.insertion.cancel} />
      </View>
    </View>
  );
}
