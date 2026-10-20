import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Text } from '../../../../components/text';
import { LiteralEditor } from '../../editor/inspector/values/literal-editor';
import type { JsonRecord, PayloadField } from './test-model';

export interface PayloadFormProps {
  readonly fields: readonly PayloadField[];
  readonly values: JsonRecord;
  readonly disabled: boolean;
  readonly onChange: (values: JsonRecord) => void;
}

export function PayloadForm({ fields, values, disabled, onChange }: PayloadFormProps): ReactNode {
  if (fields.length === 0) {
    return (
      <Text variant="callout" tone="variant">
        This trigger gives nothing to fill in.
      </Text>
    );
  }
  return (
    <View className="gap-4">
      {fields.map((field) => (
        <View key={field.name} className="gap-1">
          <View className="flex-row items-center gap-2">
            <Text variant="body-strong">{field.label}</Text>
            {field.required ? null : (
              <Text variant="footnote" tone="variant">
                Optional
              </Text>
            )}
          </View>
          {field.description === '' ? null : (
            <Text variant="footnote" tone="variant">
              {field.description}
            </Text>
          )}
          <LiteralEditor
            control={field.control}
            label={field.label}
            value={values[field.name]}
            disabled={disabled}
            onChange={(value) => {
              onChange({ ...values, [field.name]: value });
            }}
          />
        </View>
      ))}
    </View>
  );
}
