import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../../../components/button';
import { Text } from '../../../../components/text';
import { ConnectedCards } from './illustrations';
import { STATES_COPY } from './states-copy';

export interface EmptyAutomationsProps {
  readonly onStart: () => void;
  readonly onAsk: () => void;
  readonly templates?: ReactNode;
}

export function EmptyAutomations({ onStart, onAsk, templates }: EmptyAutomationsProps): ReactNode {
  const copy = STATES_COPY.emptyAutomations;
  return (
    <View className="gap-section-gap">
      <View className="items-center gap-4 rounded-lg border-hairline border-outline-variant bg-surface-1 px-6 py-8">
        <ConnectedCards label={copy.illustration} />
        <View className="items-center gap-1">
          <Text variant="title-2" align="center" accessibilityRole="header">
            {copy.title}
          </Text>
          <Text variant="body" tone="variant" align="center" className="max-w-reading">
            {copy.body}
          </Text>
        </View>
        <View className="flex-row flex-wrap justify-center gap-3">
          <Button label={copy.start} icon="plus" onPress={onStart} />
          <Button label={copy.ask} icon="sparkles" variant="tonal" onPress={onAsk} />
        </View>
      </View>
      {templates === undefined ? null : (
        <View className="gap-2">
          <Text variant="label" tone="variant" accessibilityRole="header" className="px-1">
            {copy.templates}
          </Text>
          {templates}
        </View>
      )}
    </View>
  );
}
