import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { JsonValue } from '@smarteverything/domain';
import { Button } from '../../components/button';
import { MetadataEditor } from './metadata-editor';
import { PRESENCE_FORM_OBJECT } from './form-model';
export function ComponentAppearance({
  value,
  change,
}: {
  readonly value: JsonValue | undefined;
  readonly change: (value: JsonValue) => void;
}): ReactNode {
  const parsed = PRESENCE_FORM_OBJECT.safeParse(value);
  return (
    <View className="gap-3">
      <MetadataEditor value={parsed.success ? parsed.data : {}} change={change} />
      <Button
        label="Clear appearance overrides"
        variant="text"
        onPress={() => {
          change(null);
        }}
      />
    </View>
  );
}
