import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { ShellyPresenceDevice, ShellyVirtualComponent } from '@smarteverything/domain';
import { Button } from '../../components/button';
import { Select } from '../../components/select';
import { TextField } from '../../components/text-field';
import { Text } from '../../components/text';
import { ComponentAppearance } from './component-appearance';
import { VirtualFields } from './virtual-fields';
import { VirtualValue } from './virtual-value';
import { VIRTUAL_TYPES } from './virtual-model';
import { useVirtualDraft } from './use-virtual-draft';
import { OperationFeedback } from './operation-feedback';

export function VirtualEditor({
  sensor,
  component,
  close,
}: {
  readonly sensor: ShellyPresenceDevice;
  readonly component: ShellyVirtualComponent | null;
  readonly close: () => void;
}): ReactNode {
  const draft = useVirtualDraft(sensor, component);
  return (
    <View className="gap-3">
      <VirtualIdentity draft={draft} component={component} sensor={sensor} />
      <VirtualFields type={draft.type} value={draft.value} change={draft.change} />
      <ComponentAppearance
        value={draft.value['meta']}
        change={(meta) => {
          draft.change({ ...draft.value, meta });
        }}
      />
      {draft.error === null ? null : <Text tone="critical">{draft.error}</Text>}
      <OperationFeedback operation={draft.operation} />
      {draft.conflict ? (
        <Text tone="warning">Configuration changed. Reopen this component before saving.</Text>
      ) : null}
      <Button
        label={component === null ? 'Create component' : 'Save component'}
        loading={draft.operation.busy}
        disabled={draft.conflict}
        onPress={draft.save}
      />
      {component === null ? null : (
        <Button
          label="Delete component"
          variant="destructive"
          onPress={() => {
            void draft.operation
              .run({ action: 'virtual_delete', key: component.key })
              .then((saved) => {
                if (saved) close();
              });
          }}
        />
      )}
      <Button label="Back" variant="text" onPress={close} />
    </View>
  );
}

function VirtualIdentity({
  draft,
  component,
  sensor,
}: {
  readonly draft: ReturnType<typeof useVirtualDraft>;
  readonly component: ShellyVirtualComponent | null;
  readonly sensor: ShellyPresenceDevice;
}): ReactNode {
  const name = draft.value['name'];
  return (
    <View className="gap-3">
      {component === null ? (
        <Select
          label="Component type"
          value={draft.type}
          options={VIRTUAL_TYPES.map((kind) => ({ value: kind, label: kind }))}
          onChange={draft.setType}
        />
      ) : (
        <VirtualValue sensor={sensor} component={component} />
      )}
      {component === null ? (
        <TextField
          label="Component ID (200–299, blank automatic)"
          kind="number"
          value={typeof draft.value['id'] === 'string' ? draft.value['id'] : ''}
          onChange={(id) => {
            draft.change({ ...draft.value, id });
          }}
        />
      ) : null}
      <TextField
        label="Component name"
        value={typeof name === 'string' ? name : ''}
        onChange={(next) => {
          draft.change({ ...draft.value, name: next });
        }}
      />
    </View>
  );
}
