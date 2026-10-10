import { robotMoveLabel, type JsonValue, type RobotMove } from '@smarteverything/domain';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../components/button';
import { Select } from '../../components/select';
import { Sheet } from '../../components/sheet';
import { Text } from '../../components/text';
import { TextField } from '../../components/text-field';
import { moveValue, optionHint, type Given } from './move-model';

function Option({
  option,
  value,
  onChange,
}: {
  readonly option: RobotMove['options'][number];
  readonly value: string;
  readonly onChange: (value: string) => void;
}): ReactNode {
  const hint = optionHint(option.rule);
  if (option.choices.length > 0) {
    return (
      <Select
        label={option.name}
        options={option.choices.map((choice) => ({ value: choice, label: choice }))}
        value={value === '' ? null : value}
        onChange={onChange}
        placeholder="Not set"
        searchable={option.choices.length > 8}
      />
    );
  }
  return (
    <TextField
      label={option.name}
      value={value}
      onChange={onChange}
      {...(hint === '' ? {} : { placeholder: hint, helper: `Format: ${hint}` })}
    />
  );
}

function MoveBody({
  move,
  given,
  onGiven,
}: {
  readonly move: RobotMove;
  readonly given: Given;
  readonly onGiven: (given: Given) => void;
}): ReactNode {
  return (
    <View className="gap-4">
      <Text variant="body" tone="variant">
        {move.description}
      </Text>
      {move.instructions === '' ? null : (
        <Text variant="footnote" tone="faint">
          {move.instructions}
        </Text>
      )}
      {move.options.map((option) => (
        <Option
          key={option.name}
          option={option}
          value={given[option.name] ?? ''}
          onChange={(value) => {
            onGiven({ ...given, [option.name]: value });
          }}
        />
      ))}
    </View>
  );
}

export function MoveSheet({
  move,
  onClose,
  onSend,
}: {
  readonly move: RobotMove | null;
  readonly onClose: () => void;
  readonly onSend: (value: JsonValue) => void;
}): ReactNode {
  const [given, setGiven] = useState<Given>({});
  if (move === null) {
    return null;
  }
  return (
    <Sheet
      open
      onClose={onClose}
      title={robotMoveLabel(move.id)}
      detents={['fit']}
      footer={
        <>
          <Button label="Cancel" variant="text" onPress={onClose} />
          <Button
            label="Send"
            onPress={() => {
              onClose();
              onSend(moveValue(move, given));
            }}
          />
        </>
      }
    >
      <MoveBody move={move} given={given} onGiven={setGiven} />
    </Sheet>
  );
}
