import {
  AUTOMATION_CHOICE_ID,
  type AutomationValueContent,
  type AutomationValueOperation,
} from '@smarteverything/domain';
import { randomUUID } from 'expo-crypto';

export function blankValue(kind: AutomationValueContent['kind']): AutomationValueContent {
  if (kind === 'boolean') return { kind, name: '', value: false };
  if (kind === 'choice') {
    const id = AUTOMATION_CHOICE_ID.parse(randomUUID());
    return { kind, name: '', value: id, choices: [{ id, label: 'First' }], overflow: 'wrap' };
  }
  return { kind, name: '', value: 0, bounds: { overflow: 'reject' } };
}

export function valueText(content: AutomationValueContent): string {
  if (content.kind === 'boolean') return content.value ? 'On' : 'Off';
  if (content.kind === 'choice')
    return content.choices.find((choice) => choice.id === content.value)?.label ?? 'Removed choice';
  return content.kind === 'duration' ? `${String(content.value)} ms` : String(content.value);
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
