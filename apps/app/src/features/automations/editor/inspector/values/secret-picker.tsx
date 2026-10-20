import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { JsonValue } from '@smarteverything/domain';
import { Button } from '../../../../../components/button';
import { Select } from '../../../../../components/select';
import { Text } from '../../../../../components/text';
import { referenceOptionsOf } from './reference-picker';
import { useValueServices } from './value-services';

export interface SecretPickerProps {
  readonly label: string;
  readonly value: JsonValue | undefined;
  readonly disabled: boolean;
  readonly onChange: (value: string) => void;
}

export function SecretPicker({ label, value, disabled, onChange }: SecretPickerProps): ReactNode {
  const { secrets } = useValueServices();
  return (
    <View className="gap-2">
      <Select
        label={label}
        disabled={disabled}
        value={typeof value === 'string' ? value : null}
        placeholder="Pick a secret"
        options={referenceOptionsOf(secrets.options, value)}
        onChange={onChange}
      />
      {secrets.owner ? (
        <Button
          label="Add secret"
          icon="plus"
          variant="text"
          disabled={disabled}
          onPress={secrets.onAdd}
        />
      ) : (
        <Text variant="footnote" tone="variant">
          Only the owner can add secrets.
        </Text>
      )}
    </View>
  );
}
