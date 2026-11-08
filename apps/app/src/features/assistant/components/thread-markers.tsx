import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Text } from '../../../components/text';
import type { MessageItem } from '../data/thread';

export function DaySeparator({ label }: { readonly label: string }): ReactNode {
  return (
    <View accessibilityRole="header" className="h-7 items-center justify-center">
      <Text variant="caption" tone="faint">
        {label}
      </Text>
    </View>
  );
}

export function TimeGap({ label }: { readonly label: string }): ReactNode {
  return (
    <View className="my-1 h-5 items-center justify-center">
      <Text variant="caption" tone="faint" className="tabular">
        {label}
      </Text>
    </View>
  );
}

export function UnreadLine(): ReactNode {
  return (
    <View
      accessibilityRole="text"
      accessibilityLabel="New messages"
      className="h-5 flex-row items-center gap-2"
    >
      <View className="h-px flex-1 bg-primary/60" />
      <Text variant="caption" tone="primary">
        New
      </Text>
    </View>
  );
}

export function ThreadMarkers({ item }: { readonly item: MessageItem }): ReactNode {
  return (
    <>
      {item.day === null ? null : <DaySeparator label={item.day} />}
      {item.divider ? <UnreadLine /> : null}
      {item.gap === null || item.group ? null : <TimeGap label={item.gap} />}
    </>
  );
}
