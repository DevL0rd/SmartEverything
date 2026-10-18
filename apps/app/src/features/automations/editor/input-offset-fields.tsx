import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { FromV2 } from '@smarteverything/domain';
import { SwitchRow } from '../../../components/rows';
import { Select } from '../../../components/select';
import { NumberInput } from './number-input';

interface OffsetProps {
  readonly input: FromV2;
  readonly onChange: (input: FromV2) => void;
}

function withBound(input: FromV2, key: 'min' | 'max', value: number | undefined): FromV2 {
  const { [key]: _removed, ...rest } = input;
  return value === undefined ? rest : { ...rest, [key]: value };
}

function Adjustment({ input, onChange }: OffsetProps): ReactNode {
  const add = input.add ?? 0;
  return (
    <>
      <Select
        label="Adjust by"
        value={add < 0 ? 'subtract' : 'add'}
        options={[
          { value: 'add', label: 'Add' },
          { value: 'subtract', label: 'Subtract' },
        ]}
        onChange={(direction) => {
          onChange({ ...input, add: direction === 'add' ? Math.abs(add) : -Math.abs(add) });
        }}
      />
      <NumberInput
        label="Amount"
        value={Math.abs(add)}
        onChange={(amount) => {
          if (amount !== undefined) onChange({ ...input, add: add < 0 ? -amount : amount });
        }}
      />
      <NumberInput
        label="Lowest result"
        optional
        value={input.min}
        onChange={(min) => {
          onChange(withBound(input, 'min', min));
        }}
      />
      <NumberInput
        label="Highest result"
        optional
        value={input.max}
        onChange={(max) => {
          onChange(withBound(input, 'max', max));
        }}
      />
    </>
  );
}

export function InputOffsetFields({ input, onChange }: OffsetProps): ReactNode {
  const adjusted = input.add !== undefined || input.min !== undefined || input.max !== undefined;
  return (
    <View className="gap-3">
      <SwitchRow
        title="Adjust the reading"
        subtitle="Add or subtract an amount and keep the result within limits."
        value={adjusted}
        onChange={(enabled) => {
          onChange(enabled ? { ...input, add: 1 } : { from: input.from });
        }}
      />
      {adjusted ? <Adjustment input={input} onChange={onChange} /> : null}
    </View>
  );
}
