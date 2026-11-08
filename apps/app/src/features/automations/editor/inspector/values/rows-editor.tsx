import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { JsonValue } from '@smarteverything/domain';
import { Button } from '../../../../../components/button';
import { IconButton } from '../../../../../components/icon-button';
import { Text } from '../../../../../components/text';
import type { FieldControl } from '../schema-fields';
import { CommittedField } from '../sections/committed-field';
import {
  addedEntry,
  nameProblem,
  objectOf,
  renamedEntry,
  withEntry,
  withoutEntry,
  type JsonObject,
  type NameRule,
} from './composite-model';
import { defaultLiteral } from './literal-model';
import type { LiteralProps } from './literal-scalar';

type Render = (props: LiteralProps<FieldControl>) => ReactNode;

export function RowName({
  name,
  held,
  rule,
  disabled,
  onChange,
}: {
  readonly name: string;
  readonly held: JsonObject;
  readonly rule: NameRule;
  readonly disabled: boolean;
  readonly onChange: (value: JsonObject) => void;
}): ReactNode {
  return (
    <CommittedField
      label="Name"
      kind="code"
      value={name}
      disabled={disabled}
      validate={(text) => nameProblem(Object.keys(held), name, text.trim(), rule)}
      onCommit={(text) => {
        onChange(renamedEntry(held, name, text.trim()));
      }}
    />
  );
}

export function RemoveRow({
  name,
  owner,
  disabled,
  onPress,
}: {
  readonly name: string;
  readonly owner: string;
  readonly disabled: boolean;
  readonly onPress: () => void;
}): ReactNode {
  return (
    <IconButton
      icon="trash"
      label={`Remove ${name} from ${owner}`}
      tone="critical"
      disabled={disabled}
      onPress={onPress}
    />
  );
}

export function NothingYet(): ReactNode {
  return (
    <Text variant="footnote" tone="variant">
      Nothing set yet.
    </Text>
  );
}

function isInline(item: FieldControl): boolean {
  return item.t === 'text' || item.t === 'number' || item.t === 'choice';
}

function Row({
  name,
  held,
  item,
  label,
  disabled,
  onChange,
  render,
}: {
  readonly name: string;
  readonly held: JsonObject;
  readonly item: FieldControl;
  readonly label: string;
  readonly disabled: boolean;
  readonly onChange: (value: JsonObject) => void;
  readonly render: Render;
}): ReactNode {
  const inline = isInline(item);
  const value = render({
    control: item,
    label: `${name} value`,
    value: held[name],
    disabled,
    showLabel: !inline,
    onChange: (next) => {
      onChange(withEntry(held, name, next));
    },
  });
  return (
    <View className="gap-2 rounded-md border border-outline-variant p-3">
      <View className="flex-row items-end gap-2">
        <View className="min-w-0 flex-1">
          <RowName name={name} held={held} rule="any" disabled={disabled} onChange={onChange} />
        </View>
        {inline ? <View className="min-w-0 flex-1">{value}</View> : null}
        <RemoveRow
          name={name}
          owner={label}
          disabled={disabled}
          onPress={() => {
            onChange(withoutEntry(held, name));
          }}
        />
      </View>
      {inline ? null : value}
    </View>
  );
}

function startOf(item: FieldControl): JsonValue {
  return item.t === 'json' ? '' : defaultLiteral(item);
}

export function RowsEditor({
  item,
  label,
  value,
  disabled,
  onChange,
  render,
}: Omit<LiteralProps<FieldControl>, 'control'> & {
  readonly item: FieldControl;
  readonly render: Render;
}): ReactNode {
  const held = objectOf(value);
  const names = Object.keys(held);
  return (
    <View className="gap-3">
      {names.map((name) => (
        <Row
          key={name}
          name={name}
          held={held}
          item={item}
          label={label}
          disabled={disabled}
          onChange={onChange}
          render={render}
        />
      ))}
      {names.length === 0 ? <NothingYet /> : null}
      <Button
        label="Add a row"
        spoken={`Add a row to ${label}`}
        icon="plus"
        variant="text"
        disabled={disabled}
        onPress={() => {
          onChange(addedEntry(held, 'name', startOf(item)));
        }}
      />
    </View>
  );
}
