import type { ReactNode } from 'react';
import { View } from 'react-native';
import {
  isFrom,
  type ConditionV2,
  type FromV2,
  type OperandV2,
  type TestV2,
  type TimeWindowV2,
} from '@smarteverything/domain';
import { SwitchRow } from '../../../components/rows';
import { Text } from '../../../components/text';
import type { Catalog } from '../data/use-automations';
import { compareOperators, defaultCompareTest, isCompareTest } from '../model/conditions';
import { operandInfo, shapeOfOperand } from '../model/inputs';
import { weatherKindsOf } from '../model/weather-text';
import { operandName } from '../model/describe-names';
import { OperandFields, type OperandSource } from './operand-fields';
import { TestFields } from './test-fields';
import { ClockField, WeekdayToggles } from './time-fields';
import { DaylightFields, WeatherKindFields } from './weather-fields';

type Compare = Extract<ConditionV2, { compare: unknown }>;

const COMPARE_SOURCES: readonly OperandSource[] = ['device', 'value', 'input', 'weather'];
const RAINY: TestV2 = { is: 'in', to: ['rain', 'storm'] };
const WORKDAYS = [1, 2, 3, 4, 5];
const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6];

function subjectOf(compare: Compare['compare']): OperandV2 {
  return isFrom(compare) ? compare.from : compare;
}

function rewrapped(previous: Compare['compare'], operand: OperandV2): OperandV2 | FromV2 {
  return isFrom(previous) ? { ...previous, from: operand } : operand;
}

function retargeted(catalog: Catalog, condition: Compare, operand: OperandV2): ConditionV2 {
  const next = shapeOfOperand(operandInfo(catalog, operand));
  const test =
    'weather' in operand && operand.weather === 'kind' ? RAINY : defaultCompareTest(next);
  return { compare: rewrapped(condition.compare, operand), test };
}

function subjectTitle(catalog: Catalog, subject: OperandV2): string {
  return `${operandName(catalog.names, subject)} is`;
}

function CompareTest({
  catalog,
  condition,
  onChange,
}: {
  readonly catalog: Catalog;
  readonly condition: Compare;
  readonly onChange: (condition: ConditionV2) => void;
}): ReactNode {
  const subject = subjectOf(condition.compare);
  const info = operandInfo(catalog, subject);
  const shape = shapeOfOperand(info);
  if (info.source === 'missing')
    return (
      <Text variant="callout" tone="critical">
        {info.problem}
      </Text>
    );
  if (info.source === 'weather' && info.metric === 'kind' && condition.test.is === 'in')
    return (
      <WeatherKindFields
        kinds={weatherKindsOf(condition.test.to)}
        onChange={(kinds) => {
          onChange({ ...condition, test: { is: 'in', to: kinds } });
        }}
      />
    );
  if (shape === null) return null;
  return (
    <TestFields
      catalog={catalog}
      shape={shape}
      test={condition.test}
      operators={compareOperators(shape)}
      subject={subjectTitle(catalog, subject)}
      onChange={(test) => {
        if (isCompareTest(test)) onChange({ ...condition, test });
      }}
    />
  );
}

function CompareFields({
  catalog,
  condition,
  onChange,
}: {
  readonly catalog: Catalog;
  readonly condition: Compare;
  readonly onChange: (condition: ConditionV2) => void;
}): ReactNode {
  return (
    <View className="gap-3">
      <OperandFields
        catalog={catalog}
        operand={subjectOf(condition.compare)}
        sources={COMPARE_SOURCES}
        onChange={(operand) => {
          onChange(retargeted(catalog, condition, operand));
        }}
      />
      <CompareTest catalog={catalog} condition={condition} onChange={onChange} />
    </View>
  );
}

interface TimeProps {
  readonly time: TimeWindowV2;
  readonly onChange: (condition: ConditionV2) => void;
}

function WindowFields({ time, onChange }: TimeProps): ReactNode {
  const windowed = time.after !== undefined || time.before !== undefined;
  return (
    <>
      <SwitchRow
        title="Only between two times"
        value={windowed}
        onChange={(on) => {
          const { after: _after, before: _before, ...rest } = time;
          onChange({ time: on ? { ...rest, after: '22:00', before: '06:00' } : rest });
        }}
      />
      {windowed ? (
        <View className="flex-row flex-wrap gap-6">
          <ClockField
            label="After"
            value={time.after ?? '22:00'}
            onChange={(after) => {
              onChange({ time: { ...time, after } });
            }}
          />
          <ClockField
            label="Before"
            value={time.before ?? '06:00'}
            onChange={(before) => {
              onChange({ time: { ...time, before } });
            }}
          />
        </View>
      ) : null}
    </>
  );
}

function DayFields({ time, onChange }: TimeProps): ReactNode {
  return (
    <>
      <SwitchRow
        title="Only on certain days"
        value={time.days !== undefined}
        onChange={(on) => {
          const { days: _days, ...rest } = time;
          onChange({ time: on ? { ...rest, days: [...WORKDAYS] } : rest });
        }}
      />
      {time.days === undefined ? null : (
        <WeekdayToggles
          value={time.days}
          onChange={(days) => {
            onChange({ time: { ...time, days: days.length === 0 ? [...EVERY_DAY] : days } });
          }}
        />
      )}
    </>
  );
}

function TimeConditionFields(props: TimeProps): ReactNode {
  return (
    <View className="gap-3">
      <WindowFields {...props} />
      <DayFields {...props} />
    </View>
  );
}

export function ConditionFields({
  catalog,
  condition,
  onChange,
}: {
  readonly catalog: Catalog;
  readonly condition: ConditionV2;
  readonly onChange: (condition: ConditionV2) => void;
}): ReactNode {
  if ('compare' in condition)
    return <CompareFields catalog={catalog} condition={condition} onChange={onChange} />;
  if ('time' in condition) return <TimeConditionFields time={condition.time} onChange={onChange} />;
  if ('daylight' in condition)
    return (
      <DaylightFields
        condition={condition}
        onChange={(next) => {
          onChange(next);
        }}
      />
    );
  return null;
}
