import type { ReactNode } from 'react';
import { ScrollView } from 'react-native';
import type { HomeMap, HomeMapActor, HomeMapOp } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { Segmented } from '../../../../components/segmented';
import { Text } from '../../../../components/text';
import type { EditorView } from '../tool-state';
import { ObjectsDevicesList } from './objects-devices';
import { RoomsWallsList } from './rooms-walls';

export const EDITOR_VIEW_LABEL = 'Edit on the map or as a list';

export const NO_FLOOR_TEXT = 'Add a floor to edit it as a list.';

const VIEW_OPTIONS = [
  { value: 'map', label: 'Map', icon: 'plan' },
  { value: 'list', label: 'List', icon: 'list' },
] as const;

export interface EditorViewSwitchProps {
  readonly view: EditorView;
  readonly onChange: (view: EditorView) => void;
}

export function EditorViewSwitch({ view, onChange }: EditorViewSwitchProps): ReactNode {
  return (
    <Segmented
      size="control"
      label={EDITOR_VIEW_LABEL}
      fill
      value={view}
      onChange={onChange}
      options={VIEW_OPTIONS}
    />
  );
}

export interface ListModeProps {
  readonly map: HomeMap;
  readonly floorId: string | null;
  readonly actor: HomeMapActor;
  readonly readOnly: boolean;
  readonly edit: (ops: readonly HomeMapOp[]) => Promise<unknown>;
}

export function ListMode({ map, floorId, actor, readOnly, edit }: ListModeProps): ReactNode {
  const floor = map.floors.find((item) => item.id === floorId);
  const send = (ops: readonly HomeMapOp[]): void => {
    background(edit(ops), 'home_map.list_edit_failed');
  };
  return (
    <ScrollView
      className="flex-1 bg-bg"
      contentContainerClassName="gap-6 px-gutter py-4"
      keyboardShouldPersistTaps="handled"
    >
      {floor === undefined ? (
        <Text variant="body" tone="variant">
          {NO_FLOOR_TEXT}
        </Text>
      ) : (
        <>
          <RoomsWallsList map={map} floor={floor} actor={actor} readOnly={readOnly} send={send} />
          <ObjectsDevicesList
            map={map}
            floor={floor}
            actor={actor}
            readOnly={readOnly}
            send={send}
          />
        </>
      )}
    </ScrollView>
  );
}
