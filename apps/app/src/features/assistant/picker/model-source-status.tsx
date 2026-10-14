import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../../components/button';
import { Text } from '../../../components/text';
export function ModelSourceStatus({
  name,
  pending,
  error,
  retry,
}: {
  readonly name: string;
  readonly pending: boolean;
  readonly error: Error | null;
  readonly retry: () => void;
}): ReactNode {
  if (!pending && error === null) return null;
  return (
    <View className="gap-2 px-3 py-2">
      <Text tone={error === null ? 'variant' : 'warning'}>
        {error === null ? `Loading ${name} models…` : error.message}
      </Text>
      {error === null ? null : (
        <Button label={`Retry ${name} models`} variant="text" onPress={retry} />
      )}
    </View>
  );
}
