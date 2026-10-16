import type { ShellyPresenceDevice, ShellyPresenceZone } from '@smarteverything/domain';
import { useRef, type ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../components/button';
import { TextField } from '../../components/text-field';
import { SwitchRow } from '../../components/rows';
import { Text } from '../../components/text';
import { AreaEditor } from './area-editor';
import { sensorOrigin } from './area-context';
import { RoomMap } from './room-map';
import { revisionOf } from './presence-data';
import { OperationFeedback } from './operation-feedback';
import { useZoneDraft, type ZoneDraft } from './use-zone-draft';
import { ZoneColor } from './zone-color';
import { useOnScreen } from '../../features/device-visuals';
import { useLiveView } from './use-live-view';

function DelayFields({ draft }: { readonly draft: ZoneDraft }): ReactNode {
  return (
    <View className="flex-row flex-wrap gap-3">
      <View className="min-w-32 flex-1">
        <TextField
          label="Occupied delay (seconds)"
          kind="number"
          value={draft.present}
          onChange={draft.setPresent}
          helper="Blank uses the sensor default"
        />
      </View>
      <View className="min-w-32 flex-1">
        <TextField
          label="Clear delay (seconds)"
          kind="number"
          value={draft.absent}
          onChange={draft.setAbsent}
          helper="Blank uses the sensor default"
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
  readonly sensor: ShellyPresenceDevice;
  readonly zone: ShellyPresenceZone | null;
  readonly draft: ZoneDraft;
  readonly close: () => void;
}): ReactNode {
  return (
    <View className="gap-3">
      {draft.conflict ? (
        <Text tone="warning">Configuration changed. Reopen this zone to reload before saving.</Text>
      ) : null}
      {draft.validation === null ? null : <Text tone="critical">{draft.validation}</Text>}
      <OperationFeedback operation={draft.operation} />
      <View className="flex-row flex-wrap gap-2">
        <Button
          label={zone === null ? 'Create zone' : 'Save zone'}
          loading={draft.operation.busy}
          disabled={!draft.validArea || draft.conflict || sensor.connection.state !== 'online'}
          onPress={draft.save}
        />
        <Button label="Back to zones" variant="text" onPress={close} />
      </View>
      {zone === null || zone.main ? null : (
        <Button
          label="Delete zone"
          variant="destructive"
          disabled={draft.operation.busy || sensor.connection.state !== 'online'}
          onPress={() => {
            void draft.operation
              .run({ action: 'delete_zone', id: zone.config.id, ...revisionOf(sensor) })
              .then((saved) => {
                if (saved) close();
              });
          }}
        />
      )}
    </View>
  );
}

export function ZoneEditor({
  sensor,
  zone,
  close,
}: {
  readonly sensor: ShellyPresenceDevice;
  readonly zone: ShellyPresenceZone | null;
  readonly close: () => void;
}): ReactNode {
  const draft = useZoneDraft(sensor, zone);
  const frame = useRef<View | null>(null);
  const { visible, onLayout } = useOnScreen(frame);
  const live = useLiveView(sensor, true, visible);
  return (
    <View ref={frame} onLayout={onLayout} className="gap-3">
      <RoomMap sensor={sensor} area={draft.area} live={live.active} />
      {live.error === null ? null : <Text tone="critical">{live.error}</Text>}
      <TextField
        label="Zone name"
        value={draft.name}
        onChange={draft.setName}
        disabled={zone?.main === true}
      />
      <SwitchRow title="Detection enabled" value={draft.enable} onChange={draft.setEnable} />
      <ZoneColor value={draft.color} change={draft.setColor} />
      <DelayFields draft={draft} />
      <AreaEditor
        tracks={live.active ? sensor.tracks : []}
        value={draft.area}
        change={draft.setArea}
        validity={draft.setValidArea}
        context={sensor.zones
          .filter((entry) => entry.key !== zone?.key)
          .flatMap((entry) => entry.config.area)}
        {...(zone?.main === true
          ? {}
          : { allowed: sensor.zones.find((entry) => entry.main)?.config.area ?? [] })}
        origin={sensorOrigin(sensor.config?.sensor?.position)}
      />
      <ZoneActions sensor={sensor} zone={zone} draft={draft} close={close} />
    </View>
  );
}
