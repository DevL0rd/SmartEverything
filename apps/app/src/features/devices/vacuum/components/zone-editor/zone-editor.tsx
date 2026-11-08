import { useMemo, type Dispatch, type ReactNode } from 'react';
import { View } from 'react-native';
import type { VacuumScene } from '@smarteverything/domain';
import type { UnifiedMap } from '../../model/unified-map';
import type { RenderBounds } from '../../../../../components/house-map/render-scene';
import { houseZoneView, robotZoneView, type ZoneView } from './zone-frame';
import type { ZoneAction, ZoneState } from './zone-reducer';
import { canUndo } from './zone-reducer';
import { countsOf, limitReason } from './zone-shapes';
import { ZoneList } from './zone-list';
import { ZoneStage } from './zone-stage';
import { ZoneToolbar } from './zone-toolbar';

export interface ZoneEditorProps {
  readonly deviceId: string;
  readonly scene: VacuumScene;
  readonly state: ZoneState;
  readonly dispatch: Dispatch<ZoneAction>;
  readonly unified?: UnifiedMap | null;
}

interface HouseFloor {
  readonly map: UnifiedMap;
  readonly bounds: RenderBounds;
}

function houseOf(unified: UnifiedMap | null): HouseFloor | null {
  const bounds = unified?.floor.bounds ?? null;
  return unified === null || bounds === null ? null : { map: unified, bounds };
}

export function zoneViewOf(scene: VacuumScene, unified: UnifiedMap | null): ZoneView {
  const house = houseOf(unified);
  return house === null
    ? robotZoneView(scene.bounds)
    : houseZoneView(house.bounds, house.map.transform);
}

function Toolbar({
  scene,
  state,
  dispatch,
}: Pick<ZoneEditorProps, 'scene' | 'state' | 'dispatch'>): ReactNode {
  const { present, selected, mode } = state;
  return (
    <ZoneToolbar
      mode={mode}
      counts={countsOf(present)}
      reason={limitReason(present, mode)}
      canUndo={canUndo(state)}
      hasSelection={selected !== null}
      onMode={(next) => {
        dispatch({ type: 'mode', mode: next });
      }}
      onAdd={() => {
        dispatch({ type: 'add', bounds: scene.bounds });
      }}
      onRemove={() => {
        if (selected !== null) dispatch({ type: 'remove', key: selected });
      }}
      onUndo={() => {
        dispatch({ type: 'undo' });
      }}
    />
  );
}

export function ZoneEditor({
  deviceId,
  scene,
  state,
  dispatch,
  unified = null,
}: ZoneEditorProps): ReactNode {
  const { present, selected } = state;
  const view = useMemo(() => zoneViewOf(scene, unified), [scene, unified]);
  const house = houseOf(unified)?.map ?? null;
  return (
    <View className="gap-4">
      <ZoneStage {...{ deviceId, scene, view, state, dispatch }} unified={house} />
      <Toolbar scene={scene} state={state} dispatch={dispatch} />
      <ZoneList
        draft={present}
        selected={selected}
        bounds={scene.bounds}
        view={view}
        dispatch={dispatch}
      />
    </View>
  );
}
