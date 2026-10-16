import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { AutomationInput } from '@smarteverything/domain';
import { Select } from '../../../components/select';
import { SwitchRow } from '../../../components/rows';
import { NumberInput } from './number-input';

interface OffsetProps {
  readonly input: AutomationInput;
  readonly onChange: (input: AutomationInput) => void;
}

function OffsetBounds({ input, onChange }: OffsetProps): ReactNode {
  const { offset } = input;
  if (offset === undefined) return null;
  return (
    <>
      <NumberInput
        label="Minimum result (optional)"
        value={offset.minimum}
        optional
        onChange={(minimum) => {
          const { minimum: _minimum, ...rest } = offset;
          onChange({ ...input, offset: minimum === undefined ? rest : { ...rest, minimum } });
        }}
      />
      <NumberInput
        label="Maximum result (optional)"
        value={offset.maximum}
        optional
        onChange={(maximum) => {
          const { maximum: _maximum, ...rest } = offset;
          onChange({ ...input, offset: maximum === undefined ? rest : { ...rest, maximum } });
        }}
      />
    </>
  );
}

export function InputOffsetFields({ input, onChange }: OffsetProps): ReactNode {
  const { offset } = input;
  return (
    <View className="gap-3">
      <SwitchRow
        title="Add an offset"
        value={offset !== undefined}
        onChange={(enabled) => {
          onChange(
            enabled
              ? {
                  ...input,
                  offset: {
                    operation: 'add',
                    amount: 0,
                    unit: input.binding.kind === 'duration' ? 'milliseconds' : 'number',
                  },
                }
              : { binding: input.binding },
          );
        }}
      />
      {offset === undefined ? null : (
        <>
          <Select
            label="Offset"
            value={offset.operation}
            options={[
              { value: 'add', label: 'Add' },
              { value: 'subtract', label: 'Subtract' },
            ]}
            onChange={(operation) => {
              onChange({ ...input, offset: { ...offset, operation } });
            }}
          />
          <NumberInput
            label="Amount"
            value={offset.amount}
            onChange={(amount) => {
              if (amount !== undefined) onChange({ ...input, offset: { ...offset, amount } });
            }}
          />
          <OffsetBounds input={input} onChange={onChange} />
        </>
      )}
    </View>
  );
}
