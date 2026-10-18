import { useState, type ReactNode } from 'react';
import type { JsonValue } from '@smarteverything/domain';
import { SelectRow, SwitchRow } from './rows';
import { Text } from './text';
import { TextField } from './text-field';
import { arrayOf, schemaType, valueSummary, type Schema } from './schema-values';

export interface ScalarProps {
  readonly schema: Schema;
  readonly value: JsonValue;
  readonly change: (value: JsonValue) => void;
  readonly label?: string;
  readonly helper?: string;
  readonly disabled?: boolean;
  readonly multiline?: boolean;
}

function EnumRow({ schema, value, change, label, disabled }: ScalarProps): ReactNode {
  const options = arrayOf(schema['enum']);
  return (
    <SelectRow
      title={label ?? 'Value'}
      disabled={disabled === true}
      value={String(options.findIndex((entry) => entry === value))}
      options={options.map((entry, index) => ({
        value: String(index),
        label: valueSummary(entry),
      }))}
      onChange={(index) => {
        const next = options[Number(index)];
        if (next !== undefined) change(next);
      }}
    />
  );
}

function TextValue({
  schema,
  value,
  change,
  label,
  helper,
  disabled,
  multiline = true,
}: ScalarProps): ReactNode {
  const [text, setText] = useState(typeof value === 'object' ? '' : String(value));
  const type = schemaType(schema);
  const numeric = type === 'number' || type === 'integer';
  const lines = multiline && !numeric;
  return (
    <TextField
      label={label ?? 'Value'}
      disabled={disabled === true}
      value={text}
      {...(helper === undefined ? {} : { helper })}
      kind={numeric ? 'number' : 'text'}
      multiline={lines}
      onChange={(next) => {
        setText(next);
        if (!numeric) change(next);
        else change(next.trim() !== '' && Number.isFinite(Number(next)) ? Number(next) : next);
      }}
    />
  );
}

export function Scalar(props: ScalarProps): ReactNode {
  const { schema, value, change, label, disabled } = props;
  if (schema['const'] !== undefined) return <Text selectable>{valueSummary(schema['const'])}</Text>;
  if (Array.isArray(schema['enum'])) return <EnumRow {...props} />;
  const type = schemaType(schema);
  if (type === 'boolean')
    return (
      <SwitchRow
        title={label ?? 'Enabled'}
        value={value === true}
        disabled={disabled === true}
        onChange={change}
      />
    );
  if (type === 'null') return <Text tone="variant">Reset this flag to the runtime default.</Text>;
  return <TextValue {...props} />;
}
