import type { ReactNode } from 'react';
import { View } from 'react-native';
import { z } from 'zod';
import { SwitchRow } from '../../components/rows';
import { TextField } from '../../components/text-field';
import { Button } from '../../components/button';
import { Select } from '../../components/select';
import { StringListInput } from './string-list-input';
import type { PresenceFormObject } from './form-model';
import type { VirtualType } from './virtual-model';

interface FieldProps {
  readonly value: PresenceFormObject;
  readonly change: (value: PresenceFormObject) => void;
}
function EnumDefault({ value, change }: FieldProps): ReactNode {
  const options = z.array(z.string()).safeParse(value['options']);
  const chosen = value['default_value'];
  return (
    <View className="gap-3">
      <StringListInput
        title="Option"
        value={options.success ? options.data : []}
        maximum={100}
        change={(next) => {
          change({ ...value, options: next });
        }}
      />
      <Select
        label="Default value"
        value={typeof chosen === 'string' ? chosen : null}
        options={(options.success ? options.data : []).map((option) => ({
          value: option,
          label: option,
        }))}
        onChange={(next) => {
          change({ ...value, default_value: next });
        }}
      />
      <Button
        label="Clear default enum value"
        variant="text"
        onPress={() => {
          change({ ...value, default_value: null });
        }}
      />
    </View>
  );
}
function ScalarDefault({
  type,
  value,
  change,
}: FieldProps & { readonly type: VirtualType }): ReactNode {
  const chosen = value['default_value'];
  if (type === 'boolean')
    return (
      <Select
        label="Default value"
        value={chosen === true ? 'true' : chosen === false ? 'false' : null}
        options={[
          { value: 'true', label: 'True' },
          { value: 'false', label: 'False' },
        ]}
        onChange={(next) => {
          change({ ...value, default_value: next === 'true' });
        }}
      />
    );
  if (type === 'enum') return <EnumDefault value={value} change={change} />;
  if (type !== 'number' && type !== 'text') return null;
  return (
    <TextField
      label="Default value"
      kind={type === 'number' ? 'number' : 'text'}
      value={typeof chosen === 'string' || typeof chosen === 'number' ? String(chosen) : ''}
      onChange={(next) => {
        change({ ...value, default_value: next });
      }}
    />
  );
}
function NumericFields({
  value,
  change,
  keys,
}: FieldProps & { readonly keys: readonly string[] }): ReactNode {
  return keys.map((key) => {
    const current = value[key];
    return (
      <TextField
        key={key}
        label={key === 'max_len' ? 'Maximum length' : key === 'min' ? 'Minimum' : 'Maximum'}
        kind="number"
        value={typeof current === 'number' || typeof current === 'string' ? String(current) : ''}
        onChange={(next) => {
          change({ ...value, [key]: next });
        }}
      />
    );
  });
}

export function VirtualFields({
  type,
  value,
  change,
}: FieldProps & { readonly type: VirtualType }): ReactNode {
  return (
    <View className="gap-3">
      {['button', 'group'].includes(type) ? null : (
        <SwitchRow
          title="Persist value across restarts"
          value={value['persisted'] === true}
          onChange={(next) => {
            change({ ...value, persisted: next });
          }}
        />
      )}
      <ScalarDefault type={type} value={value} change={change} />
      {type === 'number' ? (
        <NumericFields value={value} change={change} keys={['min', 'max']} />
      ) : null}
      {type === 'text' ? <NumericFields value={value} change={change} keys={['max_len']} /> : null}
    </View>
  );
}
