import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { JsonValue } from '@smarteverything/domain';
import type { ShellySettingRow } from '@smarteverything/shelly';
import { z } from 'zod';
import { Button } from '../../components/button';
import { SchemaEditor } from '../../components/schema-editor';
import { Select } from '../../components/select';
import { SwitchRow } from '../../components/rows';
import { TextField } from '../../components/text-field';
import { recordOf } from './form-model';
import { StringListInput } from './string-list-input';
import { TimeWindowInput } from './time-window-input';

export interface SettingFieldProps {
  readonly row: ShellySettingRow;
  readonly value: JsonValue | undefined;
  readonly change: (value: JsonValue) => void;
  readonly disabled: boolean;
}

const CLEARED = '__cleared__';
const STRING_MAP = { type: 'object', additionalProperties: { type: 'string' } } as const;

function label(row: ShellySettingRow): string {
  return row.unit === undefined ? row.title : `${row.title} (${row.unit})`;
}

function helper(row: ShellySettingRow): string | undefined {
  const range =
    row.min === undefined || row.max === undefined
      ? undefined
      : `${String(row.min)} to ${String(row.max)}`;
  const blank = row.nullable === true ? 'Blank uses the sensor default' : undefined;
  const parts = [range, blank].filter((part) => part !== undefined);
  return parts.length === 0 ? undefined : parts.join(' · ');
}

function NumberField({ row, value, change, disabled }: SettingFieldProps): ReactNode {
  const shown = typeof value === 'string' || typeof value === 'number' ? String(value) : '';
  const hint = helper(row);
  return (
    <TextField
      label={label(row)}
      kind="number"
      value={shown}
      onChange={change}
      disabled={disabled}
      {...(hint === undefined ? {} : { helper: hint })}
    />
  );
}

function TextSetting({ row, value, change, disabled }: SettingFieldProps): ReactNode {
  return (
    <View className="gap-1">
      <TextField
        label={row.title}
        kind={row.secret === true ? 'password' : 'text'}
        value={typeof value === 'string' ? value : ''}
        onChange={change}
        disabled={disabled}
      />
      {row.nullable === true ? (
        <Button
          label={`Clear ${row.title.toLowerCase()}`}
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

function EnumField({ row, value, change, disabled }: SettingFieldProps): ReactNode {
  const options = (row.options ?? []).map((option) => ({
    value: option,
    label: row.labels?.[option] ?? option.replaceAll('_', ' '),
  }));
  const selected =
    value === null && row.nullable === true
      ? CLEARED
      : typeof value === 'string' || typeof value === 'number'
        ? String(value)
        : null;
  return (
    <Select
      label={row.title}
      value={selected}
      placeholder="Not set"
      options={
        row.nullable === true
          ? [{ value: CLEARED, label: 'Not set / default' }, ...options]
          : options
      }
      onChange={(next) => {
        change(next === CLEARED ? null : next);
      }}
      disabled={disabled}
    />
  );
}

function StringsField({ row, value, change }: SettingFieldProps): ReactNode {
  const parsed = z.array(z.string()).safeParse(value);
  return (
    <StringListInput title={row.title} value={parsed.success ? parsed.data : []} change={change} />
  );
}

function StringMapField({ value, change }: SettingFieldProps): ReactNode {
  return <SchemaEditor schema={STRING_MAP} value={recordOf(value) ?? {}} change={change} />;
}

function FlagField({ row, value, change, disabled }: SettingFieldProps): ReactNode {
  return (
    <SwitchRow title={row.title} value={value === true} onChange={change} disabled={disabled} />
  );
}

function WindowField({ row, value, change }: SettingFieldProps): ReactNode {
  return <TimeWindowInput title={row.title} value={value} change={change} />;
}

const FIELDS: Readonly<Record<ShellySettingRow['kind'], (props: SettingFieldProps) => ReactNode>> =
  {
    boolean: FlagField,
    number: NumberField,
    text: TextSetting,
    enum: EnumField,
    strings: StringsField,
    string_map: StringMapField,
    time_window: WindowField,
    area: () => null,
    rgb: () => null,
    stored_values: () => null,
  };

export function SettingField(props: SettingFieldProps): ReactNode {
  const Field = FIELDS[props.row.kind];
  return <Field {...props} />;
}
