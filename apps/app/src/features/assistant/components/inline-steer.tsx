import type { ReactNode } from 'react';
import { useChatMessages } from '../data/chat-store';
import { mergedRows, useOlderRows } from '../data/history';
import { inlineMessageItem } from './inline-image-message';
import { MessageBubble } from './message-bubble';

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
  return row === undefined ? null : <MessageBubble item={inlineMessageItem(row)} flash={false} />;
}
