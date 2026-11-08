import type { ReactNode } from 'react';
import { View } from 'react-native';
import { IconButton } from '../../../components/icon-button';
import { useAnchoredMenu, type MenuItem } from '../../../components/menu';
import type { CameraPresetId } from '../../../components/house-map/3d/render-core-orbit';
import type { EditorView } from './tool-state';

export const EDITOR_OPTIONS_LABEL = 'Editor options';

export interface EditorOptionsInput {
  readonly view: EditorView;
  readonly camera: CameraPresetId;
  readonly readOnly: boolean;
  readonly onView: (view: EditorView) => void;
  readonly onCamera: (camera: CameraPresetId) => void;
  readonly onAddFloor: () => void;
}

export function editorOptionItems(input: EditorOptionsInput): readonly MenuItem[] {
  const list = input.view === 'list';
  const side = input.camera === 'side';
  return [
    {
      id: 'view',
      label: list ? 'Back to the map' : 'List editor',
      icon: list ? 'plan' : 'list',
      onPress: (): void => {
        input.onView(list ? 'map' : 'list');
      },
    },
    {
      id: 'side',
      label: side ? 'Top view' : 'Side view',
      icon: 'eye',
      disabled: list,
      onPress: (): void => {
        input.onCamera(side ? 'top' : 'side');
      },
    },
    {
      id: 'floor',
      label: 'Add floor',
      icon: 'layers',
      disabled: input.readOnly,
      onPress: input.onAddFloor,
    },
  ];
}

export function EditorOptions(props: EditorOptionsInput): ReactNode {
  const { ref, open, menu } = useAnchoredMenu(editorOptionItems(props), EDITOR_OPTIONS_LABEL);
  return (
    <View ref={ref} collapsable={false}>
      <IconButton icon="customize" label={EDITOR_OPTIONS_LABEL} size="control" onPress={open} />
      {menu}
    </View>
  );
}
