import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../components/button';
import { TextField } from '../../components/text-field';

export function StringListInput({
  title,
  value,
  change,
  maximum = 5,
  url = false,
}: {
  readonly title: string;
  readonly value: readonly string[];
  readonly change: (value: readonly string[]) => void;
  readonly maximum?: number;
  readonly url?: boolean;
}): ReactNode {
  return (
    <View className="gap-3">
      {value.map((entry, index) => (
        <View key={index} className="gap-1">
          <TextField
            label={`${title} ${String(index + 1)}`}
            value={entry}
            kind={url ? 'url' : 'text'}
            onChange={(next) => {
              change(value.map((item, at) => (at === index ? next : item)));
            }}
          />
          <Button
            label={`Remove ${title.toLowerCase()} ${String(index + 1)}`}
            variant="text"
            onPress={() => {
              change(value.filter((_, at) => at !== index));
            }}
          />
        </View>
      ))}
      <Button
        label={`Add ${title.toLowerCase()}`}
        variant="tonal"
        icon="plus"
        disabled={value.length >= maximum}
        onPress={() => {
          change([...value, '']);
        }}
      />
    </View>
  );
}
