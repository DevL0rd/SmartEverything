import type { ReactNode } from 'react';
import { View } from 'react-native';
import {
  AUTOMATION_CHOICE_ID,
  type AutomationValueContent,
  type AutomationValueOperation,
} from '@smarteverything/domain';
import { Select } from '../../../components/select';
import { SwitchRow } from '../../../components/rows';
import { Text } from '../../../components/text';
import { NumberInput } from './number-input';

interface ValueOperationFieldsProps {
  readonly content: AutomationValueContent;
  readonly operation: AutomationValueOperation;
  readonly onChange: (operation: AutomationValueOperation) => void;
}
interface BooleanProps extends ValueOperationFieldsProps {
  readonly content: Extract<AutomationValueContent, { kind: 'boolean' }>;
  readonly operation: Extract<AutomationValueOperation, { kind: 'boolean' }>;
}
interface ChoiceProps extends ValueOperationFieldsProps {
  readonly content: Extract<AutomationValueContent, { kind: 'choice' }>;
  readonly operation: Extract<AutomationValueOperation, { kind: 'choice' }>;
}
interface NumericProps extends ValueOperationFieldsProps {
  readonly content: Extract<AutomationValueContent, { kind: 'number' | 'duration' }>;
  readonly operation: Extract<AutomationValueOperation, { kind: 'number' | 'duration' }>;
}

function BooleanOperation({ content, operation, onChange }: BooleanProps): ReactNode {
  return (
    <View className="gap-3">
      <Select
        label="Change"
        value={operation.operation.type}
        options={[
          { value: 'toggle', label: 'Toggle' },
          { value: 'set', label: 'Set' },
        ]}
        onChange={(type) => {
          onChange({
            kind: 'boolean',
            operation: type === 'set' ? { type, value: content.value } : { type },
          });
        }}
      />
      {operation.operation.type === 'set' ? (
        <SwitchRow
          title="Set to"
          value={operation.operation.value}
          onChange={(value) => {
            onChange({ kind: 'boolean', operation: { type: 'set', value } });
          }}
        />
      ) : null}
    </View>
  );
}
function ChoiceOperation({ content, operation, onChange }: ChoiceProps): ReactNode {
  return (
    <View className="gap-3">
      <Select
        label="Change"
        value={operation.operation.type}
        options={[
          { value: 'set', label: 'Set' },
          { value: 'next', label: 'Next' },
          { value: 'previous', label: 'Previous' },
        ]}
        onChange={(type) => {
          onChange({
            kind: 'choice',
            operation: type === 'set' ? { type, value: content.value } : { type },
          });
        }}
      />
      {operation.operation.type === 'set' ? (
        <Select
          label="Choice"
          value={operation.operation.value}
          options={content.choices.map((choice) => ({ value: choice.id, label: choice.label }))}
          onChange={(value) => {
            onChange({
              kind: 'choice',
              operation: { type: 'set', value: AUTOMATION_CHOICE_ID.parse(value) },
            });
          }}
        />
      ) : null}
    </View>
  );
}
function NumericOperation({ content, operation, onChange }: NumericProps): ReactNode {
  return (
    <View className="gap-3">
      <Select
        label="Change"
        value={operation.operation.type}
        options={[
          { value: 'set', label: 'Set' },
          { value: 'add', label: 'Add' },
          { value: 'subtract', label: 'Subtract' },
        ]}
        onChange={(type) => {
          onChange({
            kind: content.kind,
            operation: { type, value: type === 'set' ? content.value : 1 },
          });
        }}
      />
      <NumberInput
        label={content.kind === 'duration' ? 'Milliseconds' : 'Amount'}
        value={operation.operation.value}
        onChange={(value) => {
          if (value !== undefined)
            onChange({ kind: content.kind, operation: { type: operation.operation.type, value } });
        }}
      />
    </View>
  );
}
export function ValueOperationFields({
  content,
  operation,
  onChange,
}: ValueOperationFieldsProps): ReactNode {
  if (content.kind === 'boolean' && operation.kind === 'boolean')
    return <BooleanOperation content={content} operation={operation} onChange={onChange} />;
  if (content.kind === 'choice' && operation.kind === 'choice')
    return <ChoiceOperation content={content} operation={operation} onChange={onChange} />;
  if (
    (content.kind === 'number' || content.kind === 'duration') &&
    (operation.kind === 'number' || operation.kind === 'duration')
  )
    return <NumericOperation content={content} operation={operation} onChange={onChange} />;
  return (
    <Text variant="callout" tone="critical">
      The operation type does not match this Value. Select the Value again to change its operation.
    </Text>
  );
}
