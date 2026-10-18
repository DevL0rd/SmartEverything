import type { ReactNode } from 'react';
import { View } from 'react-native';
import { WEATHER_METRIC_INFO, type JsonValue, type TriggerTestV2 } from '@smarteverything/domain';
import { Button } from '../../../components/button';
import { Select } from '../../../components/select';
import { Text } from '../../../components/text';
import type { Catalog } from '../data/use-automations';
import {
  OPERATOR_LABELS,
  betweenFrom,
  betweenTo,
  seedOf,
  testFor,
  type TestOperator,
  type TestSeed,
} from '../model/capability-choices';
import { defaultFor, type LiteralShape } from '../model/inputs';
import { LiteralField } from './literal-field';

interface TestFieldsProps {
  readonly catalog: Catalog;
  readonly shape: LiteralShape;
  readonly test: TriggerTestV2;
  readonly operators: readonly TestOperator[];
  readonly subject?: string;
  readonly onChange: (test: TriggerTestV2) => void;
}

function seedOfShape(shape: LiteralShape): TestSeed {
  if (shape.type === 'reading') return seedOf(shape.capability.value);
  if (shape.type === 'weather') {
    const info = WEATHER_METRIC_INFO[shape.metric];
    return { fallback: info.min, min: info.min, max: info.max };
  }
  return { fallback: defaultFor(shape) };
}

function numeric(value: JsonValue, fallback: number): number {
  return typeof value === 'number' ? value : fallback;
}

function BetweenValues({
  catalog,
  shape,
  test,
  onChange,
}: TestFieldsProps & { readonly test: Extract<TriggerTestV2, { is: 'between' }> }): ReactNode {
  return (
    <View className="gap-3">
      <LiteralField
        catalog={catalog}
        shape={shape}
        label="From"
        value={test.min}
        onChange={(min) => {
          onChange(betweenFrom(test, numeric(min, test.min)));
        }}
      />
      <LiteralField
        catalog={catalog}
        shape={shape}
        label="To"
        value={test.max}
        onChange={(max) => {
          onChange(betweenTo(test, numeric(max, test.max)));
        }}
      />
    </View>
  );
}

function ListValues({
  catalog,
  shape,
  test,
  onChange,
}: TestFieldsProps & { readonly test: Extract<TriggerTestV2, { is: 'in' }> }): ReactNode {
  return (
    <View className="gap-3">
      {test.to.map((entry, index) => (
        <View key={String(index)} className="gap-1">
          <LiteralField
            catalog={catalog}
            shape={shape}
            label={`Option ${String(index + 1)}`}
            value={entry}
            onChange={(next) => {
              onChange({ ...test, to: test.to.map((old, at) => (at === index ? next : old)) });
            }}
          />
          {test.to.length > 1 ? (
            <Button
              label={`Remove option ${String(index + 1)}`}
              variant="text"
              onPress={() => {
                onChange({ ...test, to: test.to.filter((_, at) => at !== index) });
              }}
            />
          ) : null}
        </View>
      ))}
      <Button
        label="Add an option"
        icon="plus"
        variant="tonal"
        onPress={() => {
          onChange({ ...test, to: [...test.to, defaultFor(shape)] });
        }}
      />
    </View>
  );
}

type EqualityTest = Extract<TriggerTestV2, { is: 'eq' | 'ne' }>;
type RankedTest = Extract<TriggerTestV2, { is: 'gt' | 'gte' | 'lt' | 'lte' }>;

function isEquality(test: TriggerTestV2): test is EqualityTest {
  return test.is === 'eq' || test.is === 'ne';
}

function EqualityValue({
  catalog,
  shape,
  subject,
  test,
  onChange,
}: TestFieldsProps & { readonly test: EqualityTest }): ReactNode {
  return (
    <LiteralField
      catalog={catalog}
      shape={shape}
      label={subject ?? 'Value'}
      value={test.to}
      onChange={(to) => {
        onChange({ ...test, to });
      }}
    />
  );
}

function RankedValue({
  catalog,
  shape,
  subject,
  test,
  onChange,
}: TestFieldsProps & { readonly test: RankedTest }): ReactNode {
  return (
    <LiteralField
      catalog={catalog}
      shape={shape}
      label={subject ?? 'Value'}
      value={test.to}
      onChange={(to) => {
        onChange({ ...test, to: numeric(to, test.to) });
      }}
    />
  );
}

function TestValues(props: TestFieldsProps): ReactNode {
  const { test } = props;
  if (test.is === 'changed')
    return (
      <Text variant="callout" tone="variant">
        Runs whenever the value changes.
      </Text>
    );
  if (test.is === 'between') return <BetweenValues {...props} test={test} />;
  if (test.is === 'in') return <ListValues {...props} test={test} />;
  if (isEquality(test)) return <EqualityValue {...props} test={test} />;
  return <RankedValue {...props} test={test} />;
}

export function TestFields(props: TestFieldsProps): ReactNode {
  const { shape, test, operators, onChange } = props;
  const seed = seedOfShape(shape);
  return (
    <View className="gap-3">
      <Select
        label="Compare"
        value={test.is}
        options={operators.map((operator) => ({
          value: operator,
          label: OPERATOR_LABELS[operator],
        }))}
        onChange={(operator) => {
          onChange(testFor(operator, seed, test));
        }}
      />
      <TestValues {...props} />
    </View>
  );
}
