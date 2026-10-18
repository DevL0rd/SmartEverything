import {
  isFrom,
  type ConditionV2,
  type JsonValue,
  type OperandV2,
  type TestV2,
  type TriggerTestV2,
} from '@smarteverything/domain';
import { operandName, type Names } from './describe-names';
import { operandValueText } from './describe-values';
import { subjectLabel, subjectOf, subjectValue, type Subject } from './present';
import { COMPARISON_WORDS, testPhrase } from './signal-text';
import { weekdaysText } from './time-text';
import {
  daylightText,
  weatherKindText,
  weatherKindsOf,
  weatherRuleText,
  type NumericTest,
} from './weather-text';

type RankedTest = Extract<TestV2, { is: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' }>;

export function isRanked(test: TriggerTestV2): test is RankedTest {
  return test.is !== 'between' && test.is !== 'in' && test.is !== 'changed';
}

export function comparisonText(subject: Subject, test: TriggerTestV2, moving: boolean): string {
  const label = subjectLabel(subject);
  if (test.is === 'changed') return `${label} changes`;
  if (test.is === 'between')
    return `${label} is between ${subjectValue(subject, test.min)} and ${subjectValue(subject, test.max)}`;
  if (test.is === 'in')
    return `${label} is ${test.to.map((entry) => subjectValue(subject, entry)).join(' or ')}`;
  const [change, standing] = COMPARISON_WORDS[test.is];
  return `${label} ${moving ? change : standing} ${subjectValue(subject, test.to)}`;
}

export function isNumericTest(test: TriggerTestV2 | undefined): test is NumericTest {
  return (
    test !== undefined &&
    (test.is === 'gt' ||
      test.is === 'gte' ||
      test.is === 'lt' ||
      test.is === 'lte' ||
      test.is === 'between')
  );
}

function compareText(names: Names, condition: Extract<ConditionV2, { compare: unknown }>): string {
  const subject = isFrom(condition.compare) ? condition.compare.from : condition.compare;
  const { test } = condition;
  if ('weather' in subject) {
    if (subject.weather === 'kind')
      return test.is === 'in'
        ? weatherKindText(weatherKindsOf(test.to), false)
        : 'the weather matches';
    return isNumericTest(test)
      ? weatherRuleText(subject.weather, test, false)
      : `${operandName(names, subject)} ${testPhrase(test, null)}`;
  }
  if ('device' in subject) {
    const reading = subjectOf(names.devices, subject.device, subject.control);
    return comparisonText(reading, test, false);
  }
  return `${operandName(names, subject)} ${standingPhrase(names, subject, test)}`;
}

function standingPhrase(names: Names, subject: OperandV2, test: TestV2): string {
  const text = (value: JsonValue): string => operandValueText(names, subject, value);
  if (test.is === 'between') return `is between ${text(test.min)} and ${text(test.max)}`;
  if (test.is === 'in') return `is ${test.to.map(text).join(' or ')}`;
  return `${COMPARISON_WORDS[test.is][1]} ${text(test.to)}`;
}

function timeText(time: Extract<ConditionV2, { time: unknown }>['time']): string {
  const { after, before, days } = time;
  const window =
    after !== undefined && before !== undefined
      ? `between ${after} and ${before}`
      : after === undefined
        ? before === undefined
          ? ''
          : `before ${before}`
        : `after ${after}`;
  const daysText = days === undefined ? '' : weekdaysText(days).replace(/^every day$/, 'any day');
  return `it is ${[window, daysText].filter((part) => part !== '').join(' ')}`;
}

function groupText(names: Names, items: readonly ConditionV2[], joiner: string): string {
  const parts = items.map((item) => describeCondition(names, item));
  return parts.length === 1 ? (parts[0] ?? '') : parts.map((part) => `(${part})`).join(joiner);
}

export function describeCondition(names: Names, condition: ConditionV2): string {
  if ('all' in condition) return groupText(names, condition.all, ' and ');
  if ('any' in condition) return groupText(names, condition.any, ' or ');
  if ('not' in condition) return `not (${describeCondition(names, condition.not)})`;
  if ('compare' in condition) return compareText(names, condition);
  if ('time' in condition) return timeText(condition.time);
  return daylightText(condition);
}
