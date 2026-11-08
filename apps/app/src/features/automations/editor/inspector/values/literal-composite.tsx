import type { ReactNode } from 'react';
import { use } from 'react';
import { View } from 'react-native';
import type { JsonValue } from '@smarteverything/domain';
import { JSON_VALUE } from '@smarteverything/domain';
import { Button } from '../../../../../components/button';
import { IconButton } from '../../../../../components/icon-button';
import { Select } from '../../../../../components/select';
import { Text } from '../../../../../components/text';
import type { FieldControl } from '../schema-fields';
import { CommittedField } from '../sections/committed-field';
import {
  addedTransition,
  freshName,
  isList,
  isObject,
  renamedState,
  stateChoices,
  stateProblem,
  textsOf,
  transitionsOf,
  transitionsValue,
  withTransition,
  type CompositeEditorId,
  type StateListShape,
  type Transition,
} from './composite-model';
import { ConditionEditor } from './condition-editor';
import { FieldRowsLiteral } from './field-list-editor';
import { defaultLiteral, PortScopeContext } from './literal-model';
import { LookupTableEditor } from './lookup-table-editor';
import { RemoveRow } from './rows-editor';
import type { LiteralProps } from './literal-scalar';

type Render = (props: LiteralProps<FieldControl>) => ReactNode;

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

const STATES_PORT = 'states';

function useStates(): readonly string[] {
  const scope = use(PortScopeContext);
  const given = scope.ports[STATES_PORT];
  return textsOf(given !== undefined && 'lit' in given ? given.lit : undefined);
}

function StatesEditor({ label, value, disabled, onChange }: LiteralProps<FieldControl>): ReactNode {
  const states = textsOf(value);
  return (
    <View className="gap-2">
      {states.map((state, at) => (
        <View key={state} className="flex-row items-end gap-2">
          <View className="min-w-0 flex-1">
            <CommittedField
              label={`State ${String(at + 1)}`}
              value={state}
              disabled={disabled}
              validate={(text) => stateProblem(states, at, text.trim())}
              onCommit={(text) => {
                onChange(renamedState(states, at, text.trim()));
              }}
            />
          </View>
          <IconButton
            icon="trash"
            label={`Remove ${state} from ${label}`}
            tone="critical"
            disabled={disabled}
            onPress={() => {
              onChange(states.filter((_held, index) => index !== at));
            }}
          />
        </View>
      ))}
      <Button
        label="Add a state"
        icon="plus"
        variant="text"
        disabled={disabled}
        onPress={() => {
          onChange([...states, freshName(states, 'state')]);
        }}
      />
    </View>
  );
}

function StatePick({
  label,
  value,
  withAny,
  disabled,
  showLabel = true,
  onChange,
}: {
  readonly label: string;
  readonly value: string | undefined;
  readonly withAny: boolean;
  readonly disabled: boolean;
  readonly showLabel?: boolean;
  readonly onChange: (value: string) => void;
}): ReactNode {
  const states = useStates();
  const empty = states.length === 0 && !withAny;
  return (
    <View className="gap-1">
      <Select
        label={label}
        showLabel={showLabel}
        disabled={disabled || empty}
        value={value === undefined || value === '' ? null : value}
        placeholder="Pick a state"
        options={stateChoices(states, value, withAny)}
        onChange={onChange}
      />
      {empty ? (
        <Text variant="footnote" tone="variant">
          Add the states first.
        </Text>
      ) : null}
    </View>
  );
}

function EventField({
  value,
  disabled,
  onCommit,
}: {
  readonly value: string;
  readonly disabled: boolean;
  readonly onCommit: (event: string) => void;
}): ReactNode {
  return (
    <CommittedField
      label="When the event is"
      value={value}
      disabled={disabled}
      validate={(text) => (text.trim() === '' ? 'Name the event.' : undefined)}
      onCommit={(text) => {
        onCommit(text.trim());
      }}
    />
  );
}

function TransitionEnd({
  end,
  row,
  disabled,
  onPick,
}: {
  readonly end: 'from' | 'to';
  readonly row: Transition;
  readonly disabled: boolean;
  readonly onPick: (change: Partial<Transition>) => void;
}): ReactNode {
  return (
    <View className="min-w-0 flex-1">
      <StatePick
        label={end === 'from' ? 'From' : 'Go to'}
        value={row[end]}
        withAny={end === 'from'}
        disabled={disabled}
        onChange={(state) => {
          onPick({ [end]: state });
        }}
      />
    </View>
  );
}

function TransitionRow({
  row,
  rows,
  at,
  disabled,
  onRows,
}: {
  readonly row: Transition;
  readonly rows: readonly Transition[];
  readonly at: number;
  readonly disabled: boolean;
  readonly onRows: (rows: readonly Transition[]) => void;
}): ReactNode {
  const set = (change: Partial<Transition>): void => {
    onRows(withTransition(rows, at, change));
  };
  return (
    <View className="gap-2 rounded-md border border-outline-variant p-3">
      <View className="flex-row items-end gap-2">
        <TransitionEnd end="from" row={row} disabled={disabled} onPick={set} />
        <TransitionEnd end="to" row={row} disabled={disabled} onPick={set} />
        <RemoveRow
          name={`Transition ${String(at + 1)}`}
          owner="the transitions"
          disabled={disabled}
          onPress={() => {
            onRows(withTransition(rows, at, null));
          }}
        />
      </View>
      <EventField
        value={row.event}
        disabled={disabled}
        onCommit={(event) => {
          set({ event });
        }}
      />
    </View>
  );
}

function TransitionsEditor({ value, disabled, onChange }: LiteralProps<FieldControl>): ReactNode {
  const states = useStates();
  const rows = transitionsOf(value);
  const onRows = (next: readonly Transition[]): void => {
    onChange(transitionsValue(next));
  };
  return (
    <View className="gap-3">
      {rows.map((row, at) => (
        <TransitionRow key={at} row={row} rows={rows} at={at} disabled={disabled} onRows={onRows} />
      ))}
      <Button
        label="Add a transition"
        icon="plus"
        variant="text"
        disabled={disabled}
        onPress={() => {
          onRows(addedTransition(rows, states));
        }}
      />
    </View>
  );
}

function stateShapeOf(base: FieldControl): StateListShape | null {
  if (base.t === 'text') return 'initial';
  if (base.t !== 'list') return null;
  if (base.item.t === 'text') return 'states';
  return base.item.t === 'record' ? 'transitions' : null;
}

function StateListLiteral(
  props: LiteralProps<FieldControl> & { readonly base: FieldControl; readonly render: Render },
): ReactNode {
  const { base, render, ...rest } = props;
  switch (stateShapeOf(base)) {
    case 'states':
      return <StatesEditor {...rest} />;
    case 'initial':
      return (
        <StatePick
          label={rest.label}
          value={typeof rest.value === 'string' ? rest.value : undefined}
          withAny={false}
          disabled={rest.disabled}
          showLabel={rest.showLabel ?? true}
          onChange={rest.onChange}
        />
      );
    case 'transitions':
      return <TransitionsEditor {...rest} />;
    case null:
      return render({ ...rest, control: base });
  }
}

export function CompositeLiteral(
  props: LiteralProps<Extract<FieldControl, { t: 'editor' }>> & {
    readonly id: CompositeEditorId;
    readonly render: Render;
  },
): ReactNode {
  const { control, id, render, ...rest } = props;
  const base = control.base;
  switch (id) {
    case 'condition':
      return <ConditionEditor {...rest} control={base} render={render} />;
    case 'key-value-rows':
      return (
        <FieldRowsLiteral
          {...rest}
          control={base}
          base={base}
          fallbackItem={{ t: 'text' }}
          render={render}
        />
      );
    case 'field-rows':
      return (
        <FieldRowsLiteral
          {...rest}
          control={base}
          base={base}
          fallbackItem={{ t: 'json' }}
          render={render}
        />
      );
    case 'lookup-table':
      return <LookupTableEditor {...rest} render={render} />;
    case 'state-list':
      return <StateListLiteral {...rest} control={base} base={base} render={render} />;
  }
}
