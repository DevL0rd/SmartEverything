import type { ReactNode } from 'react';
import { View } from 'react-native';
import { AUTOMATION_BINDING_KIND, type SequenceParameter } from '@smarteverything/domain';
import { Button } from '../../../components/button';
import { Card } from '../../../components/card';
import { Select } from '../../../components/select';
import { TextField } from '../../../components/text-field';

interface SequenceParametersProps {
  readonly focusName?: string | null;
  readonly parameters: readonly SequenceParameter[];
  readonly onChange: (parameters: SequenceParameter[]) => void;
}

interface ParameterFieldsProps extends SequenceParametersProps {
  readonly parameter: SequenceParameter;
  readonly index: number;
}
function ParameterFields({
  parameters,
  onChange,
  parameter,
  index,
  focusName,
}: ParameterFieldsProps): ReactNode {
  return (
    <Card>
      <TextField
        label="Parameter name"
        focusOnMount={focusName === parameter.name}
        value={parameter.name}
        onChange={(name) => {
          onChange(
            parameters.map((entry, position) => (position === index ? { ...entry, name } : entry)),
          );
        }}
      />
      <Select
        label="Type"
        value={parameter.kind}
        options={AUTOMATION_BINDING_KIND.options.map((value) => ({ value, label: value }))}
        onChange={(kind) => {
          onChange(
            parameters.map((entry, position) => (position === index ? { ...entry, kind } : entry)),
          );
        }}
      />
      <Button
        label="Remove parameter"
        variant="text"
        onPress={() => {
          onChange(parameters.filter((_, position) => position !== index));
        }}
      />
    </Card>
  );
}

export function SequenceParameters({
  parameters,
  onChange,
  focusName,
}: SequenceParametersProps): ReactNode {
  return (
    <View className="gap-3">
      {parameters.map((parameter, index) => (
        <ParameterFields
          key={String(index)}
          parameters={parameters}
          onChange={onChange}
          parameter={parameter}
          index={index}
          {...(focusName === undefined ? {} : { focusName })}
        />
      ))}
      <Button
        label="Add a parameter"
        icon="plus"
        variant="tonal"
        disabled={parameters.length >= 32}
        onPress={() => {
          onChange([...parameters, { name: '', kind: 'number' }]);
        }}
      />
    </View>
  );
}
