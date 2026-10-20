import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { JsonValue } from '@smarteverything/domain';
import { JSON_VALUE } from '@smarteverything/domain';
import { Button } from '../../../../../components/button';
import { IconButton } from '../../../../../components/icon-button';
import { Text } from '../../../../../components/text';
import type { FieldControl } from '../schema-fields';
import { CommittedField } from '../sections/committed-field';
import { defaultLiteral } from './literal-model';
import type { LiteralProps } from './literal-scalar';

type Render = (props: LiteralProps<FieldControl>) => ReactNode;

function isList(value: JsonValue | undefined): value is readonly JsonValue[] {
  return Array.isArray(value);
}

function isObject(value: JsonValue | undefined): value is Readonly<Record<string, JsonValue>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function ListLiteral({
  control,
  label,
  value,
  disabled,
  onChange,
  render,
}: LiteralProps<Extract<FieldControl, { t: 'list' }>> & { readonly render: Render }): ReactNode {
  const items: readonly JsonValue[] = isList(value) ? value : [];
  return (
    <View className="gap-2">
      {items.map((item, position) => (
        <View key={position} className="flex-row items-start gap-2">
          <View className="min-w-0 flex-1">
            {render({
              control: control.item,
              label: `${label} ${String(position + 1)}`,
              value: item,
              disabled,
              onChange: (next) => {
                onChange(items.map((held, at) => (at === position ? next : held)));
              },
            })}
          </View>
          <IconButton
            icon="trash"
            label={`Remove ${label} ${String(position + 1)}`}
            onPress={() => {
              onChange(items.filter((_held, at) => at !== position));
            }}
          />
        </View>
      ))}
      <Button
        label="Add an item"
        icon="plus"
        variant="text"
        disabled={disabled}
        onPress={() => {
          onChange([...items, defaultLiteral(control.item)]);
        }}
      />
    </View>
  );
}

export function RecordLiteral({
  control,
  value,
  disabled,
  onChange,
  render,
}: LiteralProps<Extract<FieldControl, { t: 'record' }>> & { readonly render: Render }): ReactNode {
  const held = isObject(value) ? value : {};
  return (
    <View className="gap-3">
      {control.fields.map((field) => (
        <View key={field.name} className="gap-1">
          <Text variant="footnote" tone="variant">
            {field.optional ? `${field.title} (optional)` : field.title}
          </Text>
          {render({
            control: field.control,
            label: field.title,
            value: held[field.name],
            disabled,
            onChange: (next) => {
              onChange({ ...held, [field.name]: next });
            },
          })}
        </View>
      ))}
    </View>
  );
}

function parsed(text: string): JsonValue | undefined {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    if (error instanceof SyntaxError) return undefined;
    throw error;
  }
  const result = JSON_VALUE.safeParse(raw);
  return result.success ? result.data : undefined;
}

export function JsonLiteral({
  label,
  value,
  disabled,
  onChange,
}: LiteralProps<FieldControl>): ReactNode {
  return (
    <CommittedField
      label={label}
      multiline
      disabled={disabled}
      value={value === undefined ? '' : JSON.stringify(value)}
      validate={(text) => (parsed(text) === undefined ? 'This is not valid JSON.' : undefined)}
      onCommit={(text) => {
        const next = parsed(text);
        if (next !== undefined) onChange(next);
      }}
    />
  );
}
