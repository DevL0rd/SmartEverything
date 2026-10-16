import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import { z } from 'zod';
import { JSON_VALUE, humanizeEnum, type JsonValue } from '@smarteverything/domain';
import { TextField } from '../../../components/text-field';
import { Select } from '../../../components/select';
import { Switch } from '../../../components/switch';
import { Text } from '../../../components/text';
import type { ValueInputProps } from './value-input';
import {
  COMMAND_ARGUMENT_SCHEMA as ARGUMENT_SCHEMA,
  type CommandArgument as Parameter,
} from '../model/command-input';
interface ArgumentFieldProps {
  readonly name: string;
  readonly parameter: Parameter;
  readonly value: JsonValue | undefined;
  readonly optional: boolean;
  readonly onChange: (value: JsonValue | undefined) => void;
}
function defaultArgument(parameter: Parameter): JsonValue {
  switch (parameter.type) {
    case 'number':
    case 'integer':
      return parameter.minimum ?? 0;
    case 'boolean':
      return false;
    case 'object':
      return {};
    case 'array':
      return [];
    case undefined:
    default:
      return '';
  }
}
function argumentText(value: JsonValue | undefined): string {
  if (value === undefined) {
    return '';
  }
  return typeof value === 'string' ? value : JSON.stringify(value);
}
function parseArgument(text: string, parameter: Parameter): JsonValue {
  switch (parameter.type) {
    case 'integer':
      return z.coerce
        .number()
        .int()
        .parse(text === '' ? Number.NaN : text);
    case 'number':
      return z.coerce.number().parse(text === '' ? Number.NaN : text);
    case 'object':
      return z.record(z.string(), JSON_VALUE).parse(JSON.parse(text));
    case 'array':
      return z.array(JSON_VALUE).parse(JSON.parse(text));
    case undefined:
    default:
      return text;
  }
}
function parameterHint(parameter: Parameter, optional: boolean): string {
  const parts = [];
  if (optional) {
    parts.push('Optional');
  }
  if (parameter.minimum !== undefined) {
    parts.push(`Minimum ${String(parameter.minimum)}`);
  }
  if (parameter.maximum !== undefined) {
    parts.push(`Maximum ${String(parameter.maximum)}`);
  }
  if (parameter.maxLength !== undefined) {
    parts.push(`Up to ${String(parameter.maxLength)} characters`);
  }
  if (parameter.type === 'object' || parameter.type === 'array') {
    parts.push('Structured JSON; use the live device schema for its fields');
  }
  return parts.join(' · ');
}
function TypedField(props: ArgumentFieldProps): ReactNode {
  const { name, parameter, value, onChange } = props;
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const numeric = parameter.type === 'number' || parameter.type === 'integer';
  const structured = parameter.type === 'object' || parameter.type === 'array';
  const input = (text: string): void => {
    setDraft(text);
    try {
      onChange(parseArgument(text, parameter));
      setError(null);
    } catch {
      onChange(text);
      setError(numeric ? 'Enter a valid number.' : 'Enter valid JSON.');
    }
  };
  return (
    <TextField
      label={humanizeEnum(name)}
      value={draft ?? argumentText(value)}
      kind={numeric ? 'number' : 'text'}
      multiline={structured}
      error={error}
      helper={parameterHint(parameter, props.optional)}
      onChange={input}
    />
  );
}
export function ArgumentInput(props: ArgumentFieldProps): ReactNode {
  const options = props.parameter.enum;
  if (options !== undefined && options.length > 0) {
    return (
      <Select
        label={humanizeEnum(props.name)}
        options={options.map((value) => ({
          value: JSON.stringify(value),
          label: typeof value === 'string' ? humanizeEnum(value) : JSON.stringify(value),
        }))}
        value={props.value === undefined ? null : JSON.stringify(props.value)}
        onChange={(key) => {
          const chosen = options.find((value) => JSON.stringify(value) === key);
          if (chosen !== undefined) props.onChange(chosen);
        }}
      />
    );
  }
  if (props.parameter.type === 'boolean') {
    return (
      <Switch
        label={humanizeEnum(props.name)}
        value={props.value === true}
        onChange={props.onChange}
      />
    );
  }
  return <TypedField {...props} />;
}
function ArgumentField(props: ArgumentFieldProps): ReactNode {
  const included = props.value !== undefined;
  return (
    <View className="gap-2">
      {props.optional ? (
        <View className="flex-row items-center justify-between gap-3">
          <Text variant="callout">{humanizeEnum(props.name)} · optional</Text>
          <Switch
            label={`Include ${humanizeEnum(props.name)}`}
            value={included}
            onChange={(next) => {
              props.onChange(next ? defaultArgument(props.parameter) : undefined);
            }}
          />
        </View>
      ) : null}
      {!props.optional || included ? <ArgumentInput {...props} /> : null}
    </View>
  );
}
function changedArgument(
  value: Readonly<Record<string, JsonValue>>,
  name: string,
  next: JsonValue | undefined,
): JsonValue {
  const rest = Object.fromEntries(Object.entries(value).filter(([key]) => key !== name));
  return next === undefined ? rest : { ...rest, [name]: next };
}
export function SchemaArgumentsInput({ capability, value, onChange }: ValueInputProps): ReactNode {
  if (capability.value.kind !== 'action') {
    return null;
  }
  const schema = ARGUMENT_SCHEMA.safeParse(capability.value.argumentSchema);
  const given = z.record(z.string(), JSON_VALUE).safeParse(value);
  if (!schema.success || !given.success) {
    return (
      <Text variant="footnote" tone="critical">
        Action arguments or their schema are unavailable.
      </Text>
    );
  }
  const required = new Set(schema.data.required ?? []);
  return (
    <View className="gap-3">
      {Object.entries(schema.data.properties).map(([name, parameter]) => (
        <ArgumentField
          key={name}
          name={name}
          parameter={parameter}
          value={given.data[name]}
          optional={!required.has(name)}
          onChange={(next) => {
            onChange(changedArgument(given.data, name, next));
          }}
        />
      ))}
    </View>
  );
}
