import type { ShellyArea, ShellyDevice, ShellyZone } from '@smarteverything/shelly';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../components/button';
import { TextField } from '../../components/text-field';
import { SwitchRow } from '../../components/rows';
import { AreaEditor } from './area-editor';
import { sensorOrigin } from './area-context';
import { RoomMap } from './room-map';
import { OperationFeedback } from './operation-feedback';
import { useZoneDraft, type ZoneDraft } from './use-zone-draft';
import { ZoneColor } from './zone-color';
import { useCanOperate } from './use-can-operate';
import { LeaseCaption } from './lease-caption';
import { useLivePresence } from './use-live-presence';
import { background } from '@smarteverything/logging';
import { Segmented } from '../../components/segmented';
import { MapZoneEditor, useSensorMapView } from './map-zone-editor';
import type { SensorMapView } from './presence-map';

type PaintSurface = 'map' | 'grid';

const SURFACES = [
  { value: 'map', label: 'Home map', icon: 'plan' },
  { value: 'grid', label: 'Sensor grid', icon: 'grid' },
] as const;

function DelayFields({ draft }: { readonly draft: ZoneDraft }): ReactNode {
  return (
    <View className="flex-row flex-wrap gap-3">
      <View className="min-w-32 flex-1">
        <TextField
          label="Occupied delay (seconds)"
          kind="number"
          value={draft.present}
          onChange={draft.setPresent}
          helper="Blank lets the sensor decide"
        />
      </View>
      <View className="min-w-32 flex-1">
        <TextField
          label="Clear delay (seconds)"
          kind="number"
          value={draft.absent}
          onChange={draft.setAbsent}
          helper="Blank lets the sensor decide"
        />
      </View>
    </View>
  );
}

function ZoneActions({
  sensor,
  zone,
  draft,
  close,
}: {
  readonly sensor: ShellyDevice;
  readonly zone: ShellyZone | null;
  readonly draft: ZoneDraft;
  readonly close: () => void;
}): ReactNode {
  const canOperate = useCanOperate();
  return (
    <View className="gap-3">
      <OperationFeedback operation={draft.operation} />
      <View className="flex-row flex-wrap gap-2">
        <Button
          label={zone === null ? 'Create zone' : 'Save zone'}
          loading={draft.operation.busy}
          disabled={!draft.validArea || sensor.connection.state !== 'online'}
          onPress={draft.save}
        />
        <Button label="Back to zones" variant="text" onPress={close} />
      </View>
      {zone === null || zone.main || !canOperate('delete_zone') ? null : (
        <Button
          label="Delete zone"
          variant="destructive"
          disabled={draft.operation.busy || sensor.connection.state !== 'online'}
          onPress={() => {
            background(
              draft.operation
                .run({ action: 'delete_zone', params: { id: zone.config.id } })
                .then((saved) => {
                  if (saved) close();
                }),
              'operation.run_failed',
            );
          }}
        />
      )}
    </View>
  );
}

interface AreaSurfaceProps {
  readonly sensor: ShellyDevice;
  readonly tracking: boolean;
  readonly zone: ShellyZone | null;
  readonly draft: ZoneDraft;
}

function areaContext(sensor: ShellyDevice, zone: ShellyZone | null): ShellyArea {
  return sensor.zones
    .filter((entry) => entry.key !== zone?.key)
    .flatMap((entry) => entry.config.area ?? []);
}

function allowedArea(sensor: ShellyDevice, zone: ShellyZone | null): ShellyArea | undefined {
  return zone?.main === true
    ? undefined
    : (sensor.zones.find((entry) => entry.main)?.config.area ?? []);
}

function GridSurface({ sensor, tracking, zone, draft }: AreaSurfaceProps): ReactNode {
  const allowed = allowedArea(sensor, zone);
  return (
    <>
      <RoomMap sensor={sensor} area={draft.area} live={tracking} />
      <AreaEditor
        tracks={tracking ? sensor.tracks : []}
        value={draft.area}
        change={draft.setArea}
        validity={draft.setValidArea}
        context={areaContext(sensor, zone)}
        {...(allowed === undefined ? {} : { allowed })}
        origin={sensorOrigin(sensor.config?.sensor?.position)}
      />
    </>
  );
}

function MapSurface({
  sensor,
  zone,
  draft,
  view,
}: AreaSurfaceProps & { readonly view: SensorMapView }): ReactNode {
  const allowed = allowedArea(sensor, zone);
  return (
    <MapZoneEditor
      view={view}
      sensor={sensor}
      area={draft.area}
      change={draft.setArea}
      allowed={allowed}
      context={areaContext(sensor, zone)}
      roomArea={zone?.main === true}
    />
  );
}

function AreaSurface(props: AreaSurfaceProps): ReactNode {
  const view = useSensorMapView(props.sensor);
  const [surface, setSurface] = useState<PaintSurface>('map');
  if (view === null) return <GridSurface {...props} />;
  return (
    <>
      <Segmented
        label="Paint the zone on"
        options={SURFACES}
        value={surface}
        onChange={(next) => {
          if (next === 'map') props.draft.setValidArea(true);
          setSurface(next);
        }}
      />
      {surface === 'map' ? <MapSurface {...props} view={view} /> : <GridSurface {...props} />}
    </>
  );
}

export function ZoneEditor({
  sensor: base,
  zone,
  close,
}: {
  readonly sensor: ShellyDevice;
  readonly zone: ShellyZone | null;
  readonly close: () => void;
}): ReactNode {
  const { frame, onLayout, lease, sensor } = useLivePresence(base);
  const draft = useZoneDraft(base, zone);
  return (
    <View ref={frame} onLayout={onLayout} collapsable={false} className="gap-3">
      <AreaSurface sensor={sensor} tracking={lease.tracking} zone={zone} draft={draft} />
      <LeaseCaption sensor={sensor} lease={lease} />
      <TextField
        label="Zone name"
        value={draft.name}
        onChange={draft.setName}
        disabled={zone?.main === true}
      />
      <SwitchRow title="Detection enabled" value={draft.enable} onChange={draft.setEnable} />
      <ZoneColor value={draft.color} change={draft.setColor} />
      <DelayFields draft={draft} />
      <ZoneActions sensor={sensor} zone={zone} draft={draft} close={close} />
    </View>
  );
}
