import { useState, type ReactNode } from 'react';
import type { JsonValue } from '@smarteverything/domain';
import { Scalar } from './schema-scalar';
import { replaceField, schemaOf, schemaType, type Schema } from './schema-values';
import { TextField } from './text-field';

interface FormProps {
  readonly schema: Schema;
  readonly value: Schema;
  readonly change: (value: Schema) => void;
  readonly disabled: boolean;
}

export function joinLines(value: JsonValue | undefined): string {
  return Array.isArray(value) ? value.map(String).join('\n') : '';
}

export function splitLines(text: string): readonly string[] {
  return text.split('\n').filter((line) => line.trim() !== '');
}

function LinesField({
  label,
  helper,
  value,
  change,
  disabled,
}: {
  readonly label: string;
  readonly helper: string | undefined;
  readonly value: JsonValue | undefined;
  readonly change: (value: JsonValue) => void;
  readonly disabled: boolean;
}): ReactNode {
  const [text, setText] = useState(joinLines(value));
  return (
    <TextField
      label={label}
      disabled={disabled}
      value={text}
      {...(helper === undefined ? {} : { helper })}
      multiline
      onChange={(next) => {
        setText(next);
        change(splitLines(next));
      }}
    />
  );
}

export function SchemaForm({ schema, value, change, disabled }: FormProps): ReactNode {
  return Object.entries(schemaOf(schema['properties'])).map(([name, raw]) => {
    const field = schemaOf(raw);
    const label = typeof field['title'] === 'string' ? field['title'] : name;
    const helper = typeof field['description'] === 'string' ? field['description'] : undefined;
    const current = value[name];
    const set = (next: JsonValue): void => {
      const cleared = next === '' && schemaType(field) !== 'string';
      change(replaceField(value, name, cleared ? undefined : next));
    };
    return schemaType(field) === 'array' ? (
      <LinesField
        key={name}
        label={label}
        helper={helper}
        value={current}
        change={set}
        disabled={disabled}
      />
    ) : (
      <Scalar
        key={name}
        schema={field}
        value={current ?? ''}
        change={set}
        label={label}
        disabled={disabled}
        multiline={false}
        {...(helper === undefined ? {} : { helper })}
      />
    );
  });
}
