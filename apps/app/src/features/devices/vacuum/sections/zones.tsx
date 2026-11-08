import { useEffect, useReducer, type ReactNode } from 'react';
import { View } from 'react-native';
import {
  API_ENDPOINTS as E,
  isVacuumTaskPhase,
  vacuumPhase,
  vacuumSceneVersion,
  type VacuumRestricted,
  type VacuumScene,
} from '@smarteverything/domain';
import { api } from '../../../../api/transport';
import { Button } from '../../../../components/button';
import { EmptyState } from '../../../../components/empty-state';
import { Text } from '../../../../components/text';
import { useMutationState, type MutationState } from '../../../../store/mutation';
import type { Device } from '../../../../store/state';
import { ZoneEditor } from '../components/zone-editor/zone-editor';
import {
  initialZoneState,
  isDirty,
  zoneReducer,
  type ZoneAction,
  type ZoneState,
} from '../components/zone-editor/zone-reducer';
import { cleanZonesOf, restrictedOf } from '../components/zone-editor/zone-shapes';
import { parseMapVersion } from '../data/map-feed';
import { useVacuumScene } from '../data/scene-query';
import { useUnifiedMap } from '../data/use-unified-map';
import { useVacuum } from '../data/use-vacuum';
import { useVacuumActions } from '../data/use-vacuum-actions';
import { readingOf, valueOrNull } from '../model/readings';
import type { UnifiedMap } from '../model/unified-map';

interface Saving {
  readonly save: () => void;
  readonly undoSave: () => void;
  readonly busy: boolean;
}

function useSaving(
  deviceId: string,
  state: ZoneState,
  dispatch: (action: ZoneAction) => void,
): Saving {
  const mutation: MutationState = useMutationState();
  const edit = (body: VacuumRestricted): Promise<{ readonly previous: VacuumRestricted }> =>
    api().call(E.editVacuumAreas, { params: { deviceId }, body });
  const { previousSaved } = state;
  return {
    busy: mutation.busy,
    save: (): void => {
      mutation.run(() => edit(restrictedOf(state.present)), {
        failure: 'The areas were not saved.',
        label: 'vacuum.areas_save',
        onDone: (result) => {
          dispatch({ type: 'saved', previous: result.previous });
        },
      });
    },
    undoSave: (): void => {
      if (previousSaved === null) return;
      mutation.run(() => edit(previousSaved), {
        failure: 'The previous areas were not restored.',
        label: 'vacuum.areas_undo',
        onDone: () => {
          dispatch({ type: 'restored', restricted: previousSaved });
        },
      });
    },
  };
}

function Actions({
  state,
  saving,
  taskRunning,
  onClean,
}: {
  readonly state: ZoneState;
  readonly saving: Saving;
  readonly taskRunning: boolean;
  readonly onClean: () => void;
}): ReactNode {
  const zones = cleanZonesOf(state.present).length;
  const dirty = isDirty(state);
  return (
    <View className="gap-2">
      <Button
        label={zones === 1 ? 'Clean 1 zone' : `Clean ${String(zones)} zones`}
        icon="vacuum"
        size="lg"
        grow
        disabled={zones === 0 || taskRunning}
        onPress={onClean}
      />
      <View className="flex-row gap-2">
        <Button
          label="Save areas"
          icon="check"
          variant="tonal"
          size="lg"
          grow
          disabled={!dirty || saving.busy}
          loading={saving.busy}
          onPress={saving.save}
        />
        {state.previousSaved === null ? null : (
          <Button
            label="Undo save"
            icon="undo"
            variant="outlined"
            size="lg"
            grow
            disabled={saving.busy || dirty}
            onPress={saving.undoSave}
          />
        )}
      </View>
    </View>
  );
}

function ZonesBody({
  device,
  scene,
  unified,
  taskRunning,
}: {
  readonly device: Device;
  readonly scene: VacuumScene;
  readonly unified: UnifiedMap | null;
  readonly taskRunning: boolean;
}): ReactNode {
  const version = vacuumSceneVersion(scene);
  const [state, dispatch] = useReducer(zoneReducer, undefined, () =>
    initialZoneState(scene.zones, version),
  );
  useEffect(() => {
    dispatch({ type: 'sync', zones: scene.zones, version });
  }, [scene.zones, version]);
  const actions = useVacuumActions(device);
  const saving = useSaving(device.id, state, dispatch);
  return (
    <View className="gap-4">
      <ZoneEditor
        deviceId={device.id}
        scene={scene}
        state={state}
        dispatch={dispatch}
        unified={unified}
      />
      <Actions
        state={state}
        saving={saving}
        taskRunning={taskRunning}
        onClean={() => {
          actions.cleanZones(cleanZonesOf(state.present));
        }}
      />
    </View>
  );
}

export function VacuumZones({ device }: { readonly device: Device }): ReactNode {
  const { snapshot } = useVacuum(device);
  const mapVersion = valueOrNull(readingOf(() => parseMapVersion(snapshot.mapVersionText)));
  const { scene, loading } = useVacuumScene(device.id, mapVersion);
  const unified = useUnifiedMap(device.id, snapshot.mapVersionText);
  const taskRunning = isVacuumTaskPhase(vacuumPhase(snapshot.values));
  return (
    <View className="gap-3 rounded-lg bg-surface-1 p-4">
      <Text variant="body-strong" accessibilityRole="header">
        Zones and no-go
      </Text>
      {scene === null ? (
        <EmptyState
          compact
          icon="mapPin"
          title={loading ? 'Loading the map' : 'No map yet'}
          body={
            loading
              ? 'Zones are drawn on the map as soon as it arrives.'
              : 'Run a quick mapping first, then draw zones and no-go areas here.'
          }
        />
      ) : (
        <ZonesBody
          key={device.id}
          device={device}
          scene={scene}
          unified={unified}
          taskRunning={taskRunning}
        />
      )}
    </View>
  );
}
