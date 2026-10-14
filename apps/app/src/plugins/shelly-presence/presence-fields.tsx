import type { ReactNode } from 'react';
import { View } from 'react-native';
import { TextField } from '../../components/text-field';
import { Select } from '../../components/select';
import { SwitchRow } from '../../components/rows';
import { Text } from '../../components/text';
import { Button } from '../../components/button';
import type { JsonValue, ShellyPresenceField } from '@smarteverything/domain';
import { z } from 'zod';
import { StringListInput } from './string-list-input';
import { StringPairsInput } from './string-pairs-input';
import { PRESENCE_FORM_OBJECT } from './form-model';
import { SchemaEditor } from '../../components/schema-editor';
import { TimeWindowInput } from './time-window-input';

export type PresenceField = ShellyPresenceField;
interface FieldProps {
  readonly field: PresenceField;
  readonly value: JsonValue | undefined;
  readonly change: (value: JsonValue) => void;
  readonly focused?: boolean;
  readonly disabled?: boolean;
}
function NumericInput({
  field,
  value,
  change,
  focused = false,
  disabled = false,
}: FieldProps): ReactNode {
  if (field.value.kind !== 'number') return null;
  const shown = typeof value === 'string' || typeof value === 'number' ? String(value) : '';
  const label =
    field.value.unit === undefined ? field.title : `${field.title} (${field.value.unit})`;
  return (
    <TextField
      label={label}
      kind="number"
      value={shown}
      onChange={change}
      focusOnMount={focused}
      disabled={disabled}
      {...(field.value.nullable === true ? { helper: 'Blank uses the sensor default' } : {})}
    />
  );
}
function TextInput({
  field,
  value,
  change,
  focused = false,
  disabled = false,
}: FieldProps): ReactNode {
  if (field.value.kind !== 'text') return null;
  return (
    <View className="gap-1">
      <TextField
        label={field.title}
        kind={field.value.secret === true ? 'password' : 'text'}
        value={typeof value === 'string' ? value : ''}
        onChange={change}
        focusOnMount={focused}
        disabled={disabled}
      />
      {field.value.nullable === true ? (
        <Button
          label={`Clear ${field.title.toLowerCase()}`}
          variant="text"
          disabled={disabled}
          onPress={() => {
            change(null);
          }}
        />
      ) : null}
    </View>
  );
}
function EnumInput({ field, value, change, disabled = false }: FieldProps): ReactNode {
  if (field.value.kind !== 'enum') return null;
  const options = field.value.options.map((option) => ({
    value: option,
    label:
      field.value.kind === 'enum'
        ? (field.value.optionLabels?.[option] ?? option.replaceAll('_', ' '))
        : option,
  }));
  const nullable = field.value.nullable === true;
  const selected = value === null && nullable ? '__clear_value__' : enumSelection(field, value);
  return (
    <Select
      label={field.title}
      value={selected}
      options={
        nullable ? [{ value: '__clear_value__', label: 'Not set / no TLS' }, ...options] : options
      }
      onChange={(next) => {
        change(next === '__clear_value__' ? null : next);
      }}
      disabled={disabled}
    />
  );
}
function StringsInput({ field, value, change }: FieldProps): ReactNode {
  if (field.value.kind !== 'strings') return null;
  const parsed = z.array(z.string()).safeParse(value);
  return (
    <StringListInput
      title={field.title}
      value={parsed.success ? parsed.data : []}
      maximum={field.value.maxItems}
      change={change}
    />
  );
}
function StringMapInput({ field, value, change }: FieldProps): ReactNode {
  const parsed = PRESENCE_FORM_OBJECT.safeParse(value);
  return (
    <StringPairsInput
      title={field.title}
      value={parsed.success ? parsed.data : {}}
      change={change}
    />
  );
}

export function PresenceFieldInput(props: FieldProps): ReactNode {
  const Input = FIELD_INPUTS[props.field.value.kind];
  return <Input {...props} />;
}

function StoredDictionary({ field, value, change }: FieldProps): ReactNode {
  const parsed = PRESENCE_FORM_OBJECT.safeParse(value);
  return (
    <View className="gap-2">
      <Text variant="body-strong">{field.title}</Text>
      <SchemaEditor
        schema={{ type: 'object', additionalProperties: true }}
        value={parsed.success ? parsed.data : {}}
        change={change}
      />
    </View>
  );
}

function BooleanInput({ field, value, change, disabled = false }: FieldProps): ReactNode {
  return (
    <SwitchRow title={field.title} value={value === true} onChange={change} disabled={disabled} />
  );
}

function TimeInput({ field, value, change }: FieldProps): ReactNode {
  return <TimeWindowInput title={field.title} value={value} change={change} />;
}
function GeometryInput({ field }: FieldProps): ReactNode {
  return (
    <Text tone="variant">
      {field.value.kind === 'area'
        ? 'Edit geometry in Room and zones.'
        : 'Edit color in the zone editor.'}
    </Text>
  );
}
const FIELD_INPUTS: Readonly<
  Record<PresenceField['value']['kind'], (props: FieldProps) => ReactNode>
> = {
  boolean: BooleanInput,
  enum: EnumInput,
  time_window: TimeInput,
  number: NumericInput,
  text: TextInput,
  strings: StringsInput,
  stored_values: StoredDictionary,
  string_map: StringMapInput,
  area: GeometryInput,
  rgb: GeometryInput,
};

function enumSelection(field: PresenceField, value: JsonValue | undefined): string | null {
  if (typeof value === 'number' || typeof value === 'string') return String(value);
  if (field.id === 'sys.ui_data.df') return 'YYYY/M/D';
  return field.id === 'sys.ui_data.tf' ? 'default' : null;
}
