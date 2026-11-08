import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { JsonValue } from '@smarteverything/domain';
import { outputLabel } from '@smarteverything/domain';
import { Button } from '../../../../../components/button';
import { IconButton } from '../../../../../components/icon-button';
import { Select } from '../../../../../components/select';
import { Text } from '../../../../../components/text';
import type { FieldControl } from '../schema-fields';
import { CommittedField } from '../sections/committed-field';
import {
  ANY_KINDS,
  anyKindOf,
  anyStart,
  entryName,
  entryNameProblem,
  refOfKey,
  type AnyKind,
} from './literal-any-model';
import type { LiteralProps } from './literal-scalar';
import { ReferencePicker } from './reference-picker';
import { useValueServices } from './value-services';

type Render = (props: LiteralProps<FieldControl>) => ReactNode;

type JsonObject = Readonly<Record<string, JsonValue>>;

function isObject(value: JsonValue | undefined): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const KIND_CONTROLS: Readonly<Record<Exclude<AnyKind, 'group' | 'list'>, FieldControl>> = {
  text: { t: 'text' },
  number: { t: 'number', integer: false, min: undefined, max: undefined, step: 1, unit: undefined },
  flag: { t: 'switch' },
  place: { t: 'reference', of: 'target', capabilities: [] },
};

function KindBody({
  kind,
  label,
  value,
  disabled,
  onChange,
  render,
}: LiteralProps<FieldControl> & { readonly kind: AnyKind; readonly render: Render }): ReactNode {
  if (kind === 'group') {
    return (
      <EntriesLiteral
        control={{ t: 'entries', item: { t: 'json' } }}
        label={label}
        value={value}
        disabled={disabled}
        onChange={onChange}
        render={render}
      />
    );
  }
  if (kind === 'list') {
    return render({
      control: { t: 'list', item: { t: 'json' } },
      label,
      value,
      disabled,
      onChange,
    });
  }
  return render({
    control: KIND_CONTROLS[kind],
    label,
    value,
    disabled,
    onChange,
    showLabel: false,
  });
}

export function AnyLiteral(
  props: LiteralProps<FieldControl> & { readonly render: Render },
): ReactNode {
  const { label, value, disabled, onChange } = props;
  const kind = anyKindOf(value);
  return (
    <View className="gap-2">
      <Select<AnyKind>
        label={`${label} type`}
        showLabel={false}
        disabled={disabled}
        value={kind}
        options={ANY_KINDS}
        onChange={(next) => {
          if (next !== kind) onChange(anyStart(next));
        }}
      />
      <KindBody {...props} kind={kind} />
    </View>
  );
}

function EntryValue({
  name,
  value,
  disabled,
  item,
  onChange,
  render,
}: {
  readonly name: string;
  readonly value: JsonValue | undefined;
  readonly disabled: boolean;
  readonly item: FieldControl;
  readonly onChange: (value: JsonValue) => void;
  readonly render: Render;
}): ReactNode {
  const { references } = useValueServices();
  const of = refOfKey(name);
  const title = outputLabel(name);
  if (of !== undefined && typeof value === 'string' && references.options(of).length > 0) {
    return (
      <ReferencePicker
        of={of}
        capabilities={[]}
        label={title}
        value={value}
        disabled={disabled}
        onChange={onChange}
      />
    );
  }
  return render({ control: item, label: title, value, disabled, onChange, showLabel: false });
}

function EntryName({
  name,
  held,
  owner,
  disabled,
  onChange,
}: {
  readonly name: string;
  readonly held: JsonObject;
  readonly owner: string;
  readonly disabled: boolean;
  readonly onChange: (value: JsonValue) => void;
}): ReactNode {
  const rename = (to: string): void => {
    if (to === '' || to === name || Object.hasOwn(held, to)) return;
    onChange(
      Object.fromEntries(
        Object.keys(held).map((key) => [key === name ? to : key, held[key] ?? null]),
      ),
    );
  };
  return (
    <View className="flex-row items-end gap-2">
      <View className="min-w-0 flex-1">
        <CommittedField
          label="Name"
          kind="code"
          value={name}
          disabled={disabled}
          validate={(text) => entryNameProblem(held, name, text.trim())}
          onCommit={(text) => {
            rename(text.trim());
          }}
        />
      </View>
      <IconButton
        icon="trash"
        label={`Remove ${outputLabel(name)} from ${owner}`}
        tone="critical"
        disabled={disabled}
        onPress={() => {
          onChange(Object.fromEntries(Object.entries(held).filter(([key]) => key !== name)));
        }}
      />
    </View>
  );
}

function Empty(): ReactNode {
  return (
    <Text variant="footnote" tone="variant">
      Nothing set yet.
    </Text>
  );
}

export function EntriesLiteral({
  control,
  label,
  value,
  disabled,
  onChange,
  render,
}: LiteralProps<Extract<FieldControl, { t: 'entries' }>> & { readonly render: Render }): ReactNode {
  const held: JsonObject = isObject(value) ? value : {};
  const names = Object.keys(held);
  return (
    <View className="gap-3">
      {names.map((name) => (
        <View key={name} className="gap-2 rounded-md border border-outline-variant p-3">
          <EntryName
            name={name}
            held={held}
            owner={label}
            disabled={disabled}
            onChange={onChange}
          />
          <EntryValue
            name={name}
            value={held[name]}
            disabled={disabled}
            item={control.item}
            onChange={(next) => {
              onChange({ ...held, [name]: next });
            }}
            render={render}
          />
        </View>
      ))}
      {names.length === 0 ? <Empty /> : null}
      <Button
        label="Add a value"
        spoken={`Add a value to ${label}`}
        icon="plus"
        variant="text"
        disabled={disabled}
        onPress={() => {
          onChange({ ...held, [entryName(names)]: control.item.t === 'json' ? '' : null });
        }}
      />
    </View>
  );
}
