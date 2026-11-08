import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import {
  API_ENDPOINTS as E,
  homeMapSnapRotation,
  isCamera,
  ptzPresetsOf,
  homeMapRoomAt,
  type DeviceModels,
  type HomeMapPlacement,
} from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { SHELLY_SETTING_ROWS, type ShellyDevice } from '@smarteverything/shelly';
import { api } from '../../../../api/transport';
import { Button } from '../../../../components/button';
import { LoadedQuery } from '../../../../components/loaded-query';
import { NumberStepper } from '../../../../components/number-stepper';
import { Segmented } from '../../../../components/segmented';
import { Skeleton } from '../../../../components/skeleton';
import { Text } from '../../../../components/text';
import { notify } from '../../../../components/toast-store';
import { recordOf } from '../../../../plugins/shelly-presence/form-model';
import { isPhysicalPresence, usePresence } from '../../../../plugins/shelly-presence/presence-data';
import { settingParams, settingsPatch } from '../../../../plugins/shelly-presence/settings-patch';
import { usePresenceOperation } from '../../../../plugins/shelly-presence/use-presence-operation';
import { useScreenQuery } from '../../../../queries/use-screen-query';
import { useDeviceValue } from '../../../../store/selectors';
import type { Device } from '../../../../store/state';
import {
  CAMERA_FACING_RANGE,
  CAMERA_TILT_RANGE,
  CameraPose,
  cameraPtzOf,
  posedCamera,
  withFacing,
  withFov,
  type CameraPlacement,
} from '../../components/camera-pose';
import { CmField } from '../list-editor/list-parts';
import { DegreeField, TURN_RANGE } from '../list-editor/object-item';
import { MOUNT_OPTIONS, placementOp } from '../list-editor/objects-devices-model';
import { roomTitle } from '../list-editor/rooms-walls-model';
import { CAMERA_POSE_HINT } from './camera-pose';
import { DeviceWallSection, type DevicesTool } from './devices';
import { ABOVE_FLOOR_LABEL } from './wall-object-inspector';
import { remountedPlacement, placementOps } from './devices-model';

export const TILT_RANGE = [-90, 90] as const;
export const FOV_RANGE = [1, 360] as const;
export const MOVE_ROOM_LABEL = 'Move to another room';
export const SHELLY_HEIGHT_ROW_ID = 'presence.sensor.height';
export const PROVIDED_MODEL_LABEL = 'Use the provided model';
export const SHELLY_WAITING_TEXT = 'The mounting height comes from the sensor once it reports.';

export function deviceModelsKey(deviceId: string): readonly unknown[] {
  return ['window', 'home-map', 'device-models', deviceId];
}

export function ownOverride(models: Pick<DeviceModels, 'overrides'>): boolean {
  return models.overrides.some((row) => row.scope === 'device');
}

export function shellyHeightOf(sensor: Pick<ShellyDevice, 'config'>): number | null {
  const height = recordOf(recordOf(sensor.config)?.['sensor'])?.['height'];
  return typeof height === 'number' ? height : null;
}

const SHELLY_HEIGHT_ROW = SHELLY_SETTING_ROWS.find((row) => row.id === SHELLY_HEIGHT_ROW_ID);

function ShellyHeightField({
  sensor,
  disabled,
}: {
  readonly sensor: ShellyDevice;
  readonly disabled: boolean;
}): ReactNode {
  const operation = usePresenceOperation(sensor);
  const row = SHELLY_HEIGHT_ROW;
  if (row === undefined) return null;
  const available = sensor.features.some((feature) => feature.id === row.id && feature.available);
  return (
    <NumberStepper
      label={row.title}
      unit={row.unit ?? 'm'}
      step={row.step ?? 0.01}
      min={row.min ?? 0}
      max={row.max ?? Number.MAX_SAFE_INTEGER}
      value={shellyHeightOf(sensor)}
      disabled={disabled || !available || operation.busy}
      onChange={(height): void => {
        const patch = settingsPatch([row], { [row.path.join('.')]: height }, sensor.config);
        const params = settingParams(row.action, { component: row.component, id: null }, patch);
        background(operation.run({ action: row.action, params }), 'home_map.shelly_height_failed');
      }}
    />
  );
}

function ShellyHeight({
  device,
  disabled,
}: {
  readonly device: Device;
  readonly disabled: boolean;
}): ReactNode {
  const stream = usePresence(device);
  if (stream.state !== 'ready') {
    return (
      <Text variant="footnote" tone="variant">
        {SHELLY_WAITING_TEXT}
      </Text>
    );
  }
  return <ShellyHeightField sensor={stream.value} disabled={disabled} />;
}

function failed(message: string): (error: unknown) => void {
  return (error) => {
    notify({ message, error, tone: 'critical' });
  };
}

const MODEL_FAILED = 'The model did not change';

interface ModelActions {
  readonly query: UseQueryResult<DeviceModels>;
  readonly choose: (modelId: string) => void;
  readonly reset: () => void;
}

function useModelActions(deviceId: string): ModelActions {
  const client = useQueryClient();
  const queryKey = deviceModelsKey(deviceId);
  const params = { deviceId };
  const query = useScreenQuery({
    queryKey,
    queryFn: () => api().call(E.readDeviceModels, { params }),
  });
  const refresh = (): Promise<void> => client.invalidateQueries({ queryKey });
  return {
    query,
    choose: (modelId): void => {
      const body = { scope: 'device' as const, model_id: modelId };
      const job = api().call(E.setDeviceModelOverride, { params, body }).then(refresh);
      background(job.catch(failed(MODEL_FAILED)), 'home_map.model_override_failed');
    },
    reset: (): void => {
      const job = api().call(E.resetDeviceModelOverride, { params, query: { scope: 'device' } });
      background(job.then(refresh).catch(failed(MODEL_FAILED)), 'home_map.model_reset_failed');
    },
  };
}

function ModelChoice({
  device,
  disabled,
}: {
  readonly device: Device;
  readonly disabled: boolean;
}): ReactNode {
  const { query, choose, reset } = useModelActions(device.id);
  return (
    <LoadedQuery query={query} loading={<Skeleton shape="block" className="h-12" />}>
      {(models) => (
        <View accessibilityLabel="Model" className="gap-2">
          <Text variant="caption" tone="variant">
            Model
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {models.candidates.map((candidate) => (
              <Button
                key={candidate.id}
                label={candidate.title}
                variant={candidate.id === models.model.id ? 'filled' : 'outlined'}
                disabled={disabled}
                onPress={(): void => {
                  choose(candidate.id);
                }}
              />
            ))}
            {ownOverride(models) ? (
              <Button
                label={PROVIDED_MODEL_LABEL}
                icon="reset"
                variant="text"
                disabled={disabled}
                onPress={reset}
              />
            ) : null}
          </View>
        </View>
      )}
    </LoadedQuery>
  );
}

interface PoseProps<P extends HomeMapPlacement = HomeMapPlacement> {
  readonly placement: P;
  readonly disabled: boolean;
  readonly patch: (next: Partial<HomeMapPlacement>) => void;
}

function CameraAim({ placement, disabled, patch }: PoseProps<CameraPlacement>): ReactNode {
  const { camera } = placement;
  return (
    <View className="gap-2">
      <View className="flex-row flex-wrap gap-3">
        <DegreeField
          label="Turn"
          value={camera.pan.yawDeg}
          range={CAMERA_FACING_RANGE}
          disabled={disabled}
          onChange={(yawDeg): void => {
            patch({ camera: withFacing(camera, yawDeg) });
          }}
        />
        <DegreeField
          label="Tilt"
          value={placement.tilt}
          range={CAMERA_TILT_RANGE}
          disabled={disabled}
          onChange={(tilt): void => {
            patch({ camera, tilt });
          }}
        />
        <DegreeField
          label="Field of view"
          value={camera.hfovDeg}
          range={FOV_RANGE}
          disabled={disabled}
          onChange={(hfovDeg): void => {
            patch({ camera: withFov(camera, 'hfovDeg', hfovDeg) });
          }}
        />
      </View>
      {disabled ? null : (
        <Text variant="caption" tone="variant">
          {CAMERA_POSE_HINT}
        </Text>
      )}
    </View>
  );
}

function CameraSection({ device, ...pose }: PoseProps & { readonly device: Device }): ReactNode {
  const preset = useDeviceValue(device.id, 'ptz_preset');
  const placement = posedCamera(pose.placement, device.model);
  return (
    <>
      <CameraAim placement={placement} disabled={pose.disabled} patch={pose.patch} />
      <CameraPose
        placement={placement}
        model={device.model}
        presets={ptzPresetsOf(device)}
        ptz={cameraPtzOf(preset?.value ?? null)}
        disabled={pose.disabled}
        patch={(next): void => {
          pose.patch({ camera: placement.camera, ...next });
        }}
      />
    </>
  );
}

function PoseFields(props: PoseProps & { readonly device: Device }): ReactNode {
  const { placement, disabled, patch } = props;
  if (isCamera(props.device)) return <CameraSection {...props} />;
  return (
    <>
      <DegreeField
        label="Rotation"
        value={placement.rotation}
        range={TURN_RANGE}
        disabled={disabled}
        onChange={(rotation): void => {
          patch({ rotation: homeMapSnapRotation(rotation, null) });
        }}
      />
      <DegreeField
        label="Tilt"
        value={placement.tilt}
        range={TILT_RANGE}
        disabled={disabled}
        onChange={(tilt): void => {
          patch({ tilt });
        }}
      />
    </>
  );
}

type InspectorTool = Pick<DevicesTool, 'floor' | 'rooms' | 'readOnly' | 'apply' | 'moveTo'>;

function RoomChoice({ tool, placement }: Omit<DeviceInspectorProps, 'device'>): ReactNode {
  const { floor } = tool;
  const here = floor === null ? null : (homeMapRoomAt(floor.rooms, placement.at)?.id ?? null);
  if (floor === null || floor.rooms.every((room) => room.id === here)) return null;
  return (
    <View accessibilityLabel={MOVE_ROOM_LABEL} className="gap-2">
      <Text variant="caption" tone="variant">
        {MOVE_ROOM_LABEL}
      </Text>
      <View className="flex-row flex-wrap gap-2">
        {floor.rooms.map((room, index) => (
          <Button
            key={room.id}
            label={roomTitle(room, tool.rooms, index)}
            variant={room.id === here ? 'filled' : 'outlined'}
            disabled={tool.readOnly || room.id === here}
            onPress={(): void => {
              tool.moveTo(placement.deviceId, room.id);
            }}
          />
        ))}
      </View>
    </View>
  );
}

function HeightFields({
  tool,
  device,
  placement,
  patch,
}: DeviceInspectorProps & {
  readonly patch: (next: Partial<HomeMapPlacement>) => void;
}): ReactNode {
  const disabled = tool.readOnly;
  const wall = placement.mount === 'wall';
  return (
    <>
      {isPhysicalPresence(device) ? (
        <ShellyHeight device={device} disabled={disabled} />
      ) : wall ? null : (
        <CmField
          label={ABOVE_FLOOR_LABEL}
          value={placement.height}
          min={0}
          disabled={disabled}
          onChange={(height): void => {
            patch({ height });
          }}
        />
      )}
      {wall ? <DeviceWallSection tool={tool} device={device} placement={placement} /> : null}
    </>
  );
}

export interface DeviceInspectorProps {
  readonly tool: InspectorTool;
  readonly device: Device;
  readonly placement: HomeMapPlacement;
}

export function DeviceInspector({ tool, device, placement }: DeviceInspectorProps): ReactNode {
  const disabled = tool.readOnly;
  const { floor } = tool;
  const patch = (next: Partial<HomeMapPlacement>): void => {
    tool.apply([placementOp(placement.floorId, device.id, next)]);
  };
  return (
    <View className="gap-3 rounded-md bg-surface-1 p-3">
      <Text variant="body-strong" accessibilityRole="header" numberOfLines={1}>
        {device.label}
      </Text>
      <Segmented
        label="Mount"
        fill
        options={MOUNT_OPTIONS}
        value={placement.mount}
        disabled={disabled || floor === null}
        onChange={(mount): void => {
          if (floor === null) return;
          const next = remountedPlacement(floor, device, placement, mount);
          tool.apply(placementOps(placement, next));
        }}
      />
      <HeightFields tool={tool} device={device} placement={placement} patch={patch} />
      <PoseFields device={device} placement={placement} disabled={disabled} patch={patch} />
      <RoomChoice tool={tool} placement={placement} />
      <ModelChoice device={device} disabled={disabled} />
      <Button
        label="Take it off the map"
        icon="trash"
        variant="destructive"
        disabled={disabled}
        onPress={(): void => {
          tool.apply(placementOps(placement, null));
        }}
      />
    </View>
  );
}
