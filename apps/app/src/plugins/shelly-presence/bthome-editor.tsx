import { BthomeObjects } from './bthome-objects';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { ShellyBthomeComponent, ShellyPresenceDevice } from '@smarteverything/domain';
import { Button } from '../../components/button';
import { TextField } from '../../components/text-field';
import { Text } from '../../components/text';
import { ComponentAppearance } from './component-appearance';
import { useBthomeDraft, type BthomeDraft } from './use-bthome-draft';
import { OperationFeedback } from './operation-feedback';
import { BthomeStatus } from './bthome-status';

function BthomeFields({
  sensorType,
  draft,
  existing,
}: {
  readonly sensorType: boolean;
  readonly draft: BthomeDraft;
  readonly existing: boolean;
}): ReactNode {
  const fields = [
    { key: 'name', label: 'Name', numeric: false },
    { key: 'addr', label: 'Device Bluetooth address', numeric: false },
    ...(sensorType
      ? [
          { key: 'obj_id', label: 'Object ID', numeric: true },
          { key: 'idx', label: 'Object index', numeric: true },
        ]
      : [{ key: 'key', label: 'Encryption key (32 hex digits)', numeric: false }]),
  ];
  return (
    <View className="gap-3">
      {existing ? null : (
        <TextField
          label="Component ID (200–299, blank automatic)"
          kind="number"
          value={typeof draft.value['id'] === 'string' ? draft.value['id'] : ''}
          onChange={(id) => {
            draft.change({ ...draft.value, id });
          }}
        />
      )}
      {fields.map((field) => {
        const value = draft.value[field.key];
        return (
          <TextField
            key={field.key}
            label={field.label}
            kind={field.key === 'key' ? 'password' : field.numeric ? 'number' : 'text'}
            value={typeof value === 'string' || typeof value === 'number' ? String(value) : ''}
            onChange={(next) => {
              draft.change({ ...draft.value, [field.key]: next });
            }}
            {...(field.key === 'key' ? { helper: 'Write only · unchanged unless edited' } : {})}
          />
        );
      })}
    </View>
  );
}

export function BthomeEditor({
  sensor,
  component,
  sensorType,
  close,
  address,
}: {
  readonly sensor: ShellyPresenceDevice;
  readonly component: ShellyBthomeComponent | null;
  readonly sensorType: boolean;
  readonly close: () => void;
  readonly address?: string;
}): ReactNode {
  const draft = useBthomeDraft(sensor, component, sensorType, address);
  return (
    <View className="gap-3">
      {component === null ? null : <BthomeStatus component={component} />}
      {sensorType ? <BthomeObjects sensor={sensor} draft={draft} /> : null}
      <BthomeFields sensorType={sensorType} draft={draft} existing={component !== null} />
      <ComponentAppearance
        value={draft.value['meta']}
        change={(meta) => {
          draft.change({ ...draft.value, meta });
        }}
      />
      {draft.error === null ? null : <Text tone="critical">{draft.error}</Text>}
      <OperationFeedback operation={draft.operation} />
      <BthomeActions draft={draft} component={component} sensorType={sensorType} close={close} />
      <Button label="Back" variant="text" onPress={close} />
    </View>
  );
}

function BthomeActions({
  draft,
  component,
  sensorType,
  close,
}: {
  readonly draft: BthomeDraft;
  readonly component: ShellyBthomeComponent | null;
  readonly sensorType: boolean;
  readonly close: () => void;
}): ReactNode {
  return (
    <View className="gap-3">
      {draft.conflict ? (
        <Text tone="warning">Configuration changed. Reopen this component before saving.</Text>
      ) : null}
      <Button
        label={
          component === null
            ? sensorType
              ? 'Add Bluetooth sensor'
              : 'Add Bluetooth device'
            : 'Save Bluetooth component'
        }
        loading={draft.operation.busy}
        disabled={draft.conflict}
        onPress={draft.save}
      />
      {component === null || component.component === 'bthome' ? null : (
        <Button
          label="Delete Bluetooth component"
          variant="destructive"
          onPress={() => {
            void draft.operation
              .run({
                action: sensorType ? 'bthome_delete_sensor' : 'bthome_delete_device',
                id: component.config.id,
              })
              .then((saved) => {
                if (saved) close();
              });
          }}
        />
      )}
    </View>
  );
}
