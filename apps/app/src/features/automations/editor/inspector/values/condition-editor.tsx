import type { ReactNode } from 'react';
import { use } from 'react';
import { View } from 'react-native';
import type { JsonValue, OptionSourceId, PortValue, SignalTest } from '@smarteverything/domain';
import { Button } from '../../../../../components/button';
import { IconButton } from '../../../../../components/icon-button';
import { Select } from '../../../../../components/select';
import { Text } from '../../../../../components/text';
import type { FieldControl } from '../schema-fields';
import {
  conditionOf,
  operatorsFor,
  specStart,
  valueKindOfSpec,
  withAdded,
  withBound,
  withListed,
  withOperator,
  withSingle,
  type Operator,
  type ValueKind,
} from './composite-model';
import { controlScopeOf, specOf } from './control-model';
import { useControlChoices } from './control-picker';
import { ControlValue } from './control-value';
import { PortScopeContext } from './literal-model';
import type { LiteralProps } from './literal-scalar';

type Render = (props: LiteralProps<FieldControl>) => ReactNode;

type ValueSource =
  | {
      readonly t: 'control';
      readonly source: OptionSourceId;
      readonly control: string;
      readonly ports: Readonly<Record<string, PortValue>>;
    }
  | { readonly t: 'plain'; readonly render: Render };

interface Typing {
  readonly kind: ValueKind;
  readonly start: JsonValue;
  readonly from: ValueSource;
  readonly disabled: boolean;
}

function OneValue({
  typing,
  label,
  value,
  numeric,
  onChange,
}: {
  readonly typing: Typing;
  readonly label: string;
  readonly value: JsonValue | undefined;
  readonly numeric: boolean;
  readonly onChange: (value: JsonValue) => void;
}): ReactNode {
  const { from, disabled } = typing;
  if (from.t === 'plain') {
    return from.render({
      control: numeric ? OPEN_NUMBER : { t: 'json' },
      label,
      value,
      disabled,
      onChange,
      showLabel: false,
    });
  }
  return (
    <ControlValue
      source={from.source}
      control={from.control}
      ports={from.ports}
      label={label}
      showLabel={false}
      value={value}
      disabled={disabled}
      onChange={onChange}
    />
  );
}

const OPEN_NUMBER: FieldControl = {
  t: 'number',
  integer: false,
  min: undefined,
  max: undefined,
  step: 1,
  unit: undefined,
};

const CONTROL_PORT = 'control';

function ListedValues({
  test,
  label,
  disabled,
  typing,
  onChange,
}: {
  readonly test: Extract<SignalTest, { is: 'in' }>;
  readonly label: string;
  readonly disabled: boolean;
  readonly typing: Typing;
  readonly onChange: (test: SignalTest) => void;
}): ReactNode {
  return (
    <View className="gap-2">
      {test.to.map((held, at) => (
        <View key={at} className="flex-row items-center gap-2">
          <View className="min-w-0 flex-1">
            <OneValue
              typing={typing}
              label={`${label} choice ${String(at + 1)}`}
              value={held}
              numeric={false}
              onChange={(next) => {
                onChange(withListed(test, at, next));
              }}
            />
          </View>
          <IconButton
            icon="trash"
            label={`Remove choice ${String(at + 1)}`}
            disabled={disabled || test.to.length === 1}
            onPress={() => {
              onChange(withListed(test, at, null));
            }}
          />
        </View>
      ))}
      <Button
        label="Add a choice"
        icon="plus"
        variant="text"
        disabled={disabled}
        onPress={() => {
          onChange(withAdded(test, typing.start));
        }}
      />
    </View>
  );
}

function Bounds({
  test,
  label,
  typing,
  onChange,
}: {
  readonly test: Extract<SignalTest, { is: 'between' }>;
  readonly label: string;
  readonly typing: Typing;
  readonly onChange: (test: SignalTest) => void;
}): ReactNode {
  const bound = (which: 'min' | 'max', title: string): ReactNode => (
    <View className="gap-1">
      <Text variant="footnote" tone="variant">
        {title}
      </Text>
      <OneValue
        typing={typing}
        label={`${label} ${title}`}
        value={test[which]}
        numeric
        onChange={(next) => {
          if (typeof next === 'number') onChange(withBound(test, which, next));
        }}
      />
    </View>
  );
  return (
    <View className="gap-2">
      {bound('min', 'From')}
      {bound('max', 'To')}
    </View>
  );
}

function TestValue({
  test,
  label,
  disabled,
  typing,
  onChange,
}: {
  readonly test: SignalTest;
  readonly label: string;
  readonly disabled: boolean;
  readonly typing: Typing;
  readonly onChange: (test: SignalTest) => void;
}): ReactNode {
  if (test.is === 'changed') return null;
  if (test.is === 'in') {
    return (
      <ListedValues
        test={test}
        label={label}
        disabled={disabled}
        typing={typing}
        onChange={onChange}
      />
    );
  }
  if (test.is === 'between') {
    return <Bounds test={test} label={label} typing={typing} onChange={onChange} />;
  }
  return (
    <OneValue
      typing={typing}
      label={`${label} value`}
      value={test.to}
      numeric={test.is !== 'eq' && test.is !== 'ne'}
      onChange={(next) => {
        const changed = withSingle(test, next);
        if (changed !== null) onChange(changed);
      }}
    />
  );
}

function ConditionBody({
  label,
  value,
  disabled,
  typing,
  onChange,
}: {
  readonly label: string;
  readonly value: JsonValue | undefined;
  readonly disabled: boolean;
  readonly typing: Typing;
  readonly onChange: (value: JsonValue) => void;
}): ReactNode {
  const test = conditionOf(value);
  const operators = operatorsFor(typing.kind);
  return (
    <View className="gap-2">
      <Select<Operator>
        label={`${label} test`}
        showLabel={false}
        disabled={disabled}
        value={test?.is ?? null}
        placeholder="Pick a test"
        options={operators}
        onChange={(operator) => {
          onChange(withOperator(test, operator, typing.start));
        }}
      />
      {test === null ? null : (
        <TestValue
          test={test}
          label={label}
          disabled={disabled}
          typing={typing}
          onChange={onChange}
        />
      )}
    </View>
  );
}

function plainTyping(render: Render, disabled: boolean): Typing {
  return { kind: 'plain', start: 0, from: { t: 'plain', render }, disabled };
}

function ControlCondition({
  source,
  control,
  field,
}: {
  readonly source: OptionSourceId;
  readonly control: string;
  readonly field: LiteralProps<FieldControl>;
}): ReactNode {
  const scope = use(PortScopeContext);
  const choices = useControlChoices(source, scope.ports);
  const spec = choices.status === 'ready' ? (specOf(choices.specs, control)?.value ?? null) : null;
  const typing: Typing = {
    kind: valueKindOfSpec(spec),
    start: specStart(spec),
    from: { t: 'control', source, control, ports: scope.ports },
    disabled: field.disabled,
  };
  return <ConditionBody {...field} typing={typing} />;
}

function controlTypingOf(
  controls: Readonly<Record<string, FieldControl>>,
  picked: JsonValue | undefined,
): { readonly source: OptionSourceId; readonly control: string } | null {
  const typing = controls[CONTROL_PORT];
  if (typing?.t !== 'pick' || controlScopeOf(typing.source) === null) return null;
  if (typeof picked !== 'string' || picked === '') return null;
  return { source: typing.source, control: picked };
}

export function ConditionEditor(
  props: LiteralProps<FieldControl> & { readonly render: Render },
): ReactNode {
  const scope = use(PortScopeContext);
  const given = scope.ports[CONTROL_PORT];
  const typing = controlTypingOf(
    scope.controls,
    given !== undefined && 'lit' in given ? given.lit : undefined,
  );
  if (typing === null) {
    return <ConditionBody {...props} typing={plainTyping(props.render, props.disabled)} />;
  }
  return <ControlCondition source={typing.source} control={typing.control} field={props} />;
}
