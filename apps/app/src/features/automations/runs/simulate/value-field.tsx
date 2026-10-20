import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { JsonValue } from '@smarteverything/domain';
import { Segmented } from '../../../../components/segmented';
import { TextField } from '../../../../components/text-field';

export interface ValueFieldProps {
  readonly label: string;
  readonly value: JsonValue;
  readonly disabled: boolean;
  readonly onChange: (value: JsonValue) => void;
}

type ValueKind = 'on' | 'off' | 'number' | 'text';

export function valueKindOf(value: JsonValue): ValueKind {
  if (typeof value === 'boolean') return value ? 'on' : 'off';
  return typeof value === 'number' ? 'number' : 'text';
}

export function valueOfKind(kind: ValueKind, text: string): JsonValue {
  if (kind === 'on') return true;
  if (kind === 'off') return false;
  if (kind === 'number') return Number.isFinite(Number(text)) ? Number(text) : 0;
  return text;
}

function textOf(value: JsonValue): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
}

export function ValueField({ label, value, disabled, onChange }: ValueFieldProps): ReactNode {
  const kind = valueKindOf(value);
  return (
    <View className="gap-2">
      <Segmented
        label={`${label} type`}
        disabled={disabled}
        value={kind}
        options={[
          { value: 'on', label: 'On' },
          { value: 'off', label: 'Off' },
          { value: 'number', label: 'Number' },
          { value: 'text', label: 'Text' },
        ]}
        onChange={(next) => {
          onChange(valueOfKind(next, textOf(value)));
        }}
      />
      {kind === 'number' || kind === 'text' ? (
        <TextField
          label={label}
          value={textOf(value)}
          kind={kind === 'number' ? 'number' : 'text'}
          disabled={disabled}
          onChange={(text) => {
            onChange(valueOfKind(kind, text));
          }}
        />
      ) : null}
    </View>
  );
}
