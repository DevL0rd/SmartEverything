import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { ShellyPresenceDevice } from '@smarteverything/domain';
import { Button } from '../../components/button';
import { NavRow } from '../../components/rows';
import { List } from '../../components/section';
import { Text } from '../../components/text';
import type { BthomeDraft } from './use-bthome-draft';
import { usePresenceOperation } from './use-presence-operation';
import { OperationFeedback } from './operation-feedback';
export function BthomeObjects({
  sensor,
  draft,
}: {
  readonly sensor: ShellyPresenceDevice;
  readonly draft: BthomeDraft;
}): ReactNode {
  const operation = usePresenceOperation(sensor);
  const device = sensor.components.find(
    (entry) => entry.component === 'bthomedevice' && entry.config.addr === draft.value['addr'],
  );
  const objects =
    operation.result?.kind === 'bthome_known_objects' ? operation.result.value.objects : [];
  return (
    <View className="gap-3">
      {device?.component !== 'bthomedevice' ? (
        <Text variant="footnote" tone="variant">
          Add this Bluetooth device to read its advertised objects, or enter the object ID and index
          below.
        </Text>
      ) : (
        <Button
          label="Read known Bluetooth objects"
          variant="tonal"
          loading={operation.busy}
          onPress={() => {
            void operation.run({ action: 'bthome_known_objects', id: device.config.id });
          }}
        />
      )}
      <List title="Known objects">
        {objects.map((object) => (
          <NavRow
            key={`${String(object.obj_id)}:${String(object.idx)}`}
            title={`Object ${String(object.obj_id)} · index ${String(object.idx)}`}
            subtitle={object.component ?? 'Not assigned'}
            onPress={() => {
              draft.change({ ...draft.value, obj_id: object.obj_id, idx: object.idx });
            }}
          />
        ))}
      </List>
      <OperationFeedback operation={operation} />
    </View>
  );
}
