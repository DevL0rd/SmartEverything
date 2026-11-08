import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Text } from '../../../components/text';
import { useChatMessages } from '../data/chat-store';
import { mergedRows, useOlderRows } from '../data/history';

export function SteerBubble({ text }: { readonly text: string }): ReactNode {
  return (
    <View className="my-0.5 max-w-4/5 self-end rounded-xl rounded-br-sm bg-primary-container px-2.5 py-1">
      <Text variant="footnote" accessibilityLabel={`You: ${text}`} selectable>
        {text}
      </Text>
    </View>
  );
}

export function InlineSteer({
  chatId,
  messageId,
}: {
  readonly chatId: string;
  readonly messageId: string;
}): ReactNode {
  const rows = useChatMessages(chatId);
  const older = useOlderRows(chatId);
  const row = mergedRows(rows, older).find((entry) => entry.id === messageId);
  return row === undefined || row.text === '' ? null : <SteerBubble text={row.text} />;
}
