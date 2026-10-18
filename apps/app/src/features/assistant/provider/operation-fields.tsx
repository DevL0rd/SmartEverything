import type { ReactNode } from 'react';
import type { JsonValue } from '@smarteverything/domain';
import { SelectRow, SwitchRow } from '../../../components/rows';
import { TextField } from '../../../components/text-field';
import type { OperationField } from './provider-operations';

export type OperationValues = Readonly<Record<string, JsonValue | undefined>>;

export function initialFields(
  fields: readonly OperationField[],
  sessionId: string | null,
): OperationValues {
  return Object.fromEntries(
    fields.map((field) => [
      field.key,
      field.key === 'session_id' ? (sessionId ?? '') : field.initial,
    ]),
  );
}

export function OperationFields({
  fields,
  values,
  change,
}: {
  readonly fields: readonly OperationField[];
  readonly values: OperationValues;
  readonly change: (values: OperationValues) => void;
}): ReactNode {
  return (
    <>
      {fields.map((field) => (
        <OperationFieldInput
          key={field.key}
          field={field}
          value={values[field.key]}
          change={(value) => {
            change({ ...values, [field.key]: value });
          }}
        />
      ))}
    </>
  );
}

export function OperationFieldInput({
  field,
  value,
  change,
}: {
  readonly field: OperationField;
  readonly value: JsonValue | undefined;
  readonly change: (value: JsonValue | undefined) => void;
}): ReactNode {
  if (field.kind === 'boolean')
    return <SwitchRow title={field.label} value={value === true} onChange={change} />;
  if (field.kind === 'enum') {
    const options = [
      ...(field.nullable === true ? [{ value: '', label: 'Runtime default' }] : []),
      ...(field.options ?? []).map((option) => ({ value: option, label: option })),
    ];
    return (
      <SelectRow
        title={field.label}
        value={typeof value === 'string' ? value : ''}
        options={options}
        onChange={(selected) => {
          change(selected === '' ? null : selected);
        }}
      />
    );
  }
  return <TextOperationField field={field} value={value} change={change} />;
}

function fieldText(value: JsonValue | undefined): string {
  if (value === undefined || value === null) return '';
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

function TextOperationField({
  field,
  value,
  change,
}: {
  readonly field: OperationField;
  readonly value: JsonValue | undefined;
  readonly change: (value: JsonValue | undefined) => void;
}): ReactNode {
  return (
    <TextField
      label={field.label}
      kind={field.kind === 'number' ? 'number' : 'text'}
      value={fieldText(value)}
      {...(field.optional === true
        ? { helper: 'Optional' }
        : field.nullable === true
          ? { helper: 'Empty follows the runtime default' }
          : {})}
      onChange={(text) => {
        if (text === '' && field.optional === true) change(undefined);
        else if (text === '' && field.nullable === true) change(null);
        else change(field.kind === 'number' ? Number(text) : text);
      }}
    />
  );
}
