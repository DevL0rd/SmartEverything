import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { Action } from '@smarteverything/domain';
import { Select } from '../../../components/select';
import { Text } from '../../../components/text';
import type { Catalog } from '../data/use-automations';
import { SequenceLibraryButtons } from './library-buttons';
import { sequenceAction } from '../model/program-actions';
import { BindingFields, literalInput } from './binding-fields';

type SequenceCall = Extract<Action, { type: 'sequence' }>;
interface SequenceCallFieldsProps {
  readonly action: SequenceCall;
  readonly catalog: Catalog;
  readonly onChange: (action: SequenceCall) => void;
}
function CallParameters({ action, catalog, onChange }: SequenceCallFieldsProps): ReactNode {
  const sequence = catalog.sequences?.find((row) => row.id === action.sequenceId);
  if (sequence === undefined)
    return (
      <Text variant="callout" tone="critical">
        This sequence is unavailable.
      </Text>
    );
  return sequence.definition.parameters.map((parameter) => (
    <View key={parameter.name} className="gap-2">
      <Text variant="body-strong">{parameter.name}</Text>
      <BindingFields
        catalog={catalog}
        fixedKind={parameter.kind}
        input={action.parameters[parameter.name] ?? literalInput(parameter.kind)}
        onChange={(input) => {
          onChange({ ...action, parameters: { ...action.parameters, [parameter.name]: input } });
        }}
      />
    </View>
  ));
}
export function SequenceCallFields({
  action,
  catalog,
  onChange,
}: SequenceCallFieldsProps): ReactNode {
  return (
    <View className="gap-3">
      <Select
        label="Sequence"
        searchable
        value={action.sequenceId}
        options={(catalog.sequences ?? []).map((row) => ({ value: row.id, label: row.name }))}
        onChange={(sequenceId) => {
          const row = catalog.sequences?.find((entry) => entry.id === sequenceId);
          if (row !== undefined) onChange(sequenceAction(row, action));
        }}
      />
      <SequenceLibraryButtons
        row={catalog.sequences?.find((row) => row.id === action.sequenceId) ?? null}
        onSelect={(row) => {
          onChange(sequenceAction(row, action));
        }}
      />
      <CallParameters action={action} catalog={catalog} onChange={onChange} />
    </View>
  );
}
