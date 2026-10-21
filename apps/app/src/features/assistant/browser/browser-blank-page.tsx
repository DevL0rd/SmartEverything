import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { Text } from '../../../components/text';
import { browserCapability } from '../../../platform/browser-surface';
export function BrowserBlankPage(): ReactNode {
  return (
    <ScrollView className="min-h-0 flex-1" contentContainerClassName="grow justify-center py-6">
      <View className="gap-2 px-6">
        <Text variant="title-3">Open a page</Text>
        <Text tone="variant">Enter an address above, or ask the AI to show a page here.</Text>
        {browserCapability().limitation === null ? null : (
          <Text variant="caption" tone="variant">
            {browserCapability().limitation}
          </Text>
        )}
      </View>
    </ScrollView>
  );
}
