import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../../../components/button';
import { Text } from '../../../../components/text';
import { FrameStrip } from './illustrations';
import { STATES_COPY } from './states-copy';

export interface EmptyNodesProps {
  readonly onCreate?: () => void;
}

export function EmptyNodes({ onCreate }: EmptyNodesProps): ReactNode {
  const copy = STATES_COPY.emptyNodes;
  return (
    <View className="items-center gap-4 self-center px-6 py-10">
      <FrameStrip label={copy.illustration} />
      <View className="items-center gap-1">
        <Text variant="title-2" align="center" accessibilityRole="header">
          {copy.title}
        </Text>
        <Text variant="body" tone="variant" align="center" className="max-w-reading">
          {copy.body}
        </Text>
      </View>
      {onCreate === undefined ? null : (
        <Button label={copy.create} icon="plus" variant="tonal" onPress={onCreate} />
      )}
    </View>
  );
}
