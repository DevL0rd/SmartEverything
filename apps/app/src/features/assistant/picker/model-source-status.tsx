import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../../components/button';
import { Text } from '../../../components/text';
import type { SourceStatus } from '../data/model-candidates';

function ModelSourceStatus({ name, pending, error, retry }: SourceStatus): ReactNode {
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

export function SourceStatuses({
  sources,
}: {
  readonly sources: readonly (SourceStatus | null)[];
}): ReactNode {
  return sources.map((source) =>
    source === null ? null : <ModelSourceStatus key={source.name} {...source} />,
  );
}
