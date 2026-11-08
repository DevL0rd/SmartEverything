import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { plural } from '../../../format/text';
import { clock } from '../../../format/time';
import { cancelPending, type PendingMessage } from '../data/outbox';
import { DeliveryGlyph } from './message-meta';
import {
  MetaAction,
  MetaDot,
  OWN_META_LINE,
  OWN_PADDING,
  ownBubbleClass,
  useTimeZone,
} from './message-parts';

export function pendingBody(message: Pick<PendingMessage, 'text' | 'attachments'>): string {
  return message.text === '' ? plural(message.attachments.length, 'file') : message.text;
}

export function PendingBubble({ message }: { readonly message: PendingMessage }): ReactNode {
  const timeZone = useTimeZone();
  const body = pendingBody(message);
  const time = clock(message.queuedAt, timeZone);
  return (
    <View className="items-end">
      <View
        accessible
        accessibilityLabel={`You, ${time}, waiting for connection: ${body}`}
        className={cn(ownBubbleClass('only'), OWN_PADDING)}
      >
        <Text variant="body">{body}</Text>
      </View>
      <View className={OWN_META_LINE}>
        <MetaAction
          text="Cancel"
          label="Cancel this message"
          onPress={() => {
            cancelPending(message.id);
          }}
        />
        <MetaDot />
        <View aria-hidden className="flex-row items-center gap-1">
          <Text variant="caption" tone="faint" className="tabular">
            {time}
          </Text>
          <DeliveryGlyph mark="queued" />
        </View>
      </View>
    </View>
  );
}
