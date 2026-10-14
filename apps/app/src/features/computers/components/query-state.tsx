import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../../components/button';
import { Text } from '../../../components/text';
import { rawErrorText } from '../../../format/errors';

export function QueryState({
  error,
  pending,
  retry,
}: {
  readonly error: Error | null;
  readonly pending: boolean;
  readonly retry: () => void;
}): ReactNode {
  if (error === null && !pending) return null;
  return (
    <View className="gap-3 px-4 py-6">
      <Text tone={error === null ? 'variant' : 'critical'}>
        {error === null ? 'Reading this computer…' : rawErrorText(error)}
      </Text>
      {error === null ? null : <Button label="Try again" variant="tonal" onPress={retry} />}
    </View>
  );
}
