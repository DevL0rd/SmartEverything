import {
  AUTOMATION_CHOICE_ID,
  type AutomationValueContent,
  type AutomationValueOperation,
} from '@smarteverything/domain';
import { randomUUID } from 'expo-crypto';
import { durationText } from './describe-values';

export function blankValue(kind: AutomationValueContent['kind']): AutomationValueContent {
  if (kind === 'boolean') return { kind, name: '', value: false };
  if (kind === 'choice') {
    const id = AUTOMATION_CHOICE_ID.parse(randomUUID());
    return { kind, name: '', value: id, choices: [{ id, label: 'First' }], overflow: 'wrap' };
  }
  return { kind, name: '', value: 0, bounds: { overflow: 'reject' } };
}

export const VALUE_TYPE_LABELS: Readonly<Record<AutomationValueContent['kind'], string>> = {
  boolean: 'On / off',
  number: 'Number',
  duration: 'Duration',
  choice: 'List',
};

export function valueText(content: AutomationValueContent): string {
  if (content.kind === 'boolean') return content.value ? 'On' : 'Off';
  if (content.kind === 'choice')
    return content.choices.find((choice) => choice.id === content.value)?.label ?? 'Removed choice';
  return content.kind === 'duration' ? durationText(content.value) : String(content.value);
}

const QUICK_DURATION_STEP_MS = 1000;
const QUICK_NUMBER_STEP = 1;

export function quickOperation(
  content: AutomationValueContent,
  direction: 'up' | 'down' | 'toggle' | 'next',
): AutomationValueOperation {
  if (content.kind === 'boolean') return { kind: content.kind, operation: { type: 'toggle' } };
  if (content.kind === 'choice') return { kind: content.kind, operation: { type: 'next' } };
  const step =
    content.bounds.quantum ??
    (content.kind === 'duration' ? QUICK_DURATION_STEP_MS : QUICK_NUMBER_STEP);
  return {
    kind: content.kind,
    operation: { type: direction === 'down' ? 'subtract' : 'add', value: step },
  };
}

export function defaultOperation(content: AutomationValueContent): AutomationValueOperation {
  switch (content.kind) {
    case 'boolean':
      return { kind: content.kind, operation: { type: 'toggle' } };
    case 'choice':
      return { kind: content.kind, operation: { type: 'next' } };
    case 'number':
    case 'duration':
      return { kind: content.kind, operation: { type: 'set', value: content.value } };
  }
}
