import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { InputDeclarationV2 } from '@smarteverything/domain';
import { Button } from '../../../components/button';
import { Card } from '../../../components/card';
import { Select } from '../../../components/select';
import { TextField } from '../../../components/text-field';
import { KINDS, KIND_LABELS } from '../model/inputs';

interface InputsProps {
  readonly inputs: readonly InputDeclarationV2[];
  readonly focusName?: string | null;
  readonly onChange: (inputs: readonly InputDeclarationV2[]) => void;
}

function InputCard({
  inputs,
  input,
  index,
  focusName,
  onChange,
}: InputsProps & { readonly input: InputDeclarationV2; readonly index: number }): ReactNode {
  const replace = (next: InputDeclarationV2): void => {
    onChange(inputs.map((entry, position) => (position === index ? next : entry)));
  };
  return (
    <Card>
      <TextField
        label="Input name"
        focusOnMount={focusName === input.name}
        value={input.name}
        onChange={(name) => {
          replace({ ...input, name });
        }}
      />
      <Select
        label="Type"
        value={input.type}
        options={KINDS.map((kind) => ({ value: kind, label: KIND_LABELS[kind] }))}
        onChange={(type) => {
          replace({ ...input, type });
        }}
      />
      <Button
        label="Remove input"
        variant="text"
        onPress={() => {
          onChange(inputs.filter((_, position) => position !== index));
        }}
      />
    </Card>
  );
}

export function InputsFields({ inputs, focusName, onChange }: InputsProps): ReactNode {
  return (
    <View className="gap-3">
      {inputs.map((input, index) => (
        <InputCard
          key={String(index)}
          inputs={inputs}
          input={input}
          index={index}
          onChange={onChange}
          {...(focusName === undefined ? {} : { focusName })}
        />
      ))}
      <Button
        label="Add an input"
        icon="plus"
        variant="tonal"
        onPress={() => {
          onChange([...inputs, { name: '', type: 'number' }]);
        }}
      />
    </View>
  );
}
