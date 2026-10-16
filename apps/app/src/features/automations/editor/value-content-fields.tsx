import type { ReactNode } from 'react';
import { View } from 'react-native';
import { randomUUID } from 'expo-crypto';
import { AUTOMATION_CHOICE_ID, type AutomationValueContent } from '@smarteverything/domain';
import { Button } from '../../../components/button';
import { IconButton } from '../../../components/icon-button';
import { Select } from '../../../components/select';
import { TextField } from '../../../components/text-field';
import { SwitchRow } from '../../../components/rows';
import { moved } from '../model/editor-state';
import { NumberInput } from './number-input';

type Choice = Extract<AutomationValueContent, { kind: 'choice' }>;
type Numeric = Extract<AutomationValueContent, { kind: 'number' | 'duration' }>;

interface ChoiceFieldsProps {
  readonly focus?: string | null;
  readonly content: Choice;
  readonly onChange: (content: Choice) => void;
}

interface ChoiceEntryProps extends ChoiceFieldsProps {
  readonly choice: Choice['choices'][number];
  readonly index: number;
}
function ChoiceEntry({ content, onChange, choice, index, focus }: ChoiceEntryProps): ReactNode {
  return (
    <View className="gap-2">
      <TextField
        label={`Choice ${String(index + 1)}`}
        focusOnMount={focus === `choice:${choice.id}`}
        value={choice.label}
        onChange={(label) => {
          onChange({
            ...content,
            choices: content.choices.map((entry) =>
              entry.id === choice.id ? { ...entry, label } : entry,
            ),
          });
        }}
      />
      <View className="flex-row justify-end">
        <IconButton
          icon="chevronUp"
          label={`Move ${choice.label} earlier`}
          disabled={index === 0}
          onPress={() => {
            onChange({ ...content, choices: moved(content.choices, index, -1) });
          }}
        />
        <IconButton
          icon="chevronDown"
          label={`Move ${choice.label} later`}
          disabled={index === content.choices.length - 1}
          onPress={() => {
            onChange({ ...content, choices: moved(content.choices, index, 1) });
          }}
        />
        <IconButton
          icon="trash"
          label={`Remove ${choice.label}`}
          disabled={choice.id === content.value}
          onPress={() => {
            onChange({
              ...content,
              choices: content.choices.filter((entry) => entry.id !== choice.id),
            });
          }}
        />
      </View>
    </View>
  );
}

function ChoiceFields({ content, onChange, focus }: ChoiceFieldsProps): ReactNode {
  return (
    <View className="gap-3">
      <Select
        label="Current choice"
        value={content.value}
        options={content.choices.map((choice) => ({ value: choice.id, label: choice.label }))}
        onChange={(value) => {
          onChange({ ...content, value });
        }}
      />
      {content.choices.map((choice, index) => (
        <ChoiceEntry
          key={choice.id}
          {...(focus === undefined ? {} : { focus })}
          content={content}
          onChange={onChange}
          choice={choice}
          index={index}
        />
      ))}
      <Button
        label="Add a choice"
        icon="plus"
        variant="tonal"
        disabled={content.choices.length >= 100}
        onPress={() => {
          onChange({
            ...content,
            choices: [
              ...content.choices,
              { id: AUTOMATION_CHOICE_ID.parse(randomUUID()), label: '' },
            ],
          });
        }}
      />
      <Select
        label="At the end"
        value={content.overflow}
        options={[
          { value: 'wrap', label: 'Wrap to the other end' },
          { value: 'clamp', label: 'Stay at the end' },
        ]}
        onChange={(overflow) => {
          onChange({ ...content, overflow });
        }}
      />
    </View>
  );
}

interface NumericFieldsProps {
  readonly focus?: string | null;
  readonly content: Numeric;
  readonly onChange: (content: Numeric) => void;
}

function OverflowField({ content, onChange }: NumericFieldsProps): ReactNode {
  return (
    <Select
      label="Outside bounds"
      value={content.bounds.overflow}
      options={[
        { value: 'reject', label: 'Reject the change' },
        { value: 'clamp', label: 'Clamp to the nearest bound' },
        { value: 'wrap', label: 'Wrap across the range' },
      ]}
      onChange={(overflow) => {
        onChange({ ...content, bounds: { ...content.bounds, overflow } });
      }}
    />
  );
}

function NumericFields({ content, onChange, focus }: NumericFieldsProps): ReactNode {
  const setBound = (key: 'minimum' | 'maximum' | 'quantum', value: number | undefined): void => {
    onChange({ ...content, bounds: { ...content.bounds, [key]: value } });
  };
  return (
    <View className="gap-3">
      <NumberInput
        label={content.kind === 'duration' ? 'Current duration (milliseconds)' : 'Current number'}
        focusOnMount={focus === 'value'}
        value={content.value}
        onChange={(value) => {
          if (value !== undefined) onChange({ ...content, value });
        }}
      />
      <NumberInput
        label="Minimum (optional)"
        focusOnMount={focus === 'bounds'}
        value={content.bounds.minimum}
        optional
        onChange={(value) => {
          setBound('minimum', value);
        }}
      />
      <NumberInput
        label="Maximum (optional)"
        value={content.bounds.maximum}
        optional
        onChange={(value) => {
          setBound('maximum', value);
        }}
      />
      <NumberInput
        label="Quantum (optional)"
        value={content.bounds.quantum}
        optional
        onChange={(value) => {
          setBound('quantum', value);
        }}
      />
      <OverflowField content={content} onChange={onChange} />
    </View>
  );
}

interface ValueContentFieldsProps {
  readonly focus?: string | null;
  readonly content: AutomationValueContent;
  readonly onChange: (content: AutomationValueContent) => void;
}

export function ValueContentFields({
  content,
  onChange,
  focus,
}: ValueContentFieldsProps): ReactNode {
  return (
    <View className="gap-4">
      <TextField
        label="Name"
        focusOnMount={focus === 'name'}
        value={content.name}
        onChange={(name) => {
          onChange({ ...content, name });
        }}
      />
      {content.kind === 'boolean' ? (
        <SwitchRow
          title="Current value"
          value={content.value}
          onChange={(value) => {
            onChange({ ...content, value });
          }}
        />
      ) : content.kind === 'choice' ? (
        <ChoiceFields
          content={content}
          onChange={onChange}
          {...(focus === undefined ? {} : { focus })}
        />
      ) : (
        <NumericFields
          content={content}
          onChange={onChange}
          {...(focus === undefined ? {} : { focus })}
        />
      )}
    </View>
  );
}
