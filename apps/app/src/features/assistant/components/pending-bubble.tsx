import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { plural } from '../../../format/text';
import { clock } from '../../../format/time';
import { useSyncStatus } from '../../../store/selectors';
import { cancelPending, removeOutgoing, retryOutgoing } from '../data/outbox';
import type { PendingMessage } from '../data/ai-drafts';
import type { UnsentMessage } from '../data/outgoing';
import type { DeliveryMark } from '../model/delivery';
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

const STATUS: Readonly<Record<Exclude<UnsentMessage['phase'], 'queued'>, string>> = {
  sending: 'sending',
  sent: 'sent',
  failed: 'not sent',
};

function statusOf(message: UnsentMessage, live: boolean): string {
  if (message.phase !== 'queued') return STATUS[message.phase];
  return live ? 'waiting to send' : 'waiting for connection';
}

const MARK: Readonly<Record<UnsentMessage['phase'], DeliveryMark>> = {
  queued: 'queued',
  sending: 'sending',
  sent: 'sent',
  failed: 'failed',
};

function UnsentActions({ message }: { readonly message: UnsentMessage }): ReactNode {
  switch (message.phase) {
    case 'queued':
      return (
        <>
          <MetaAction
            text="Cancel"
            label="Cancel this message"
            onPress={() => {
              cancelPending(message.id);
            }}
          />
          <MetaDot />
        </>
      );
    case 'failed':
      return (
        <>
          <MetaAction
            text="Retry"
            label="Send this message again"
            primary
            onPress={() => {
              retryOutgoing(message.id);
            }}
          />
          <MetaDot />
          <MetaAction
            text="Remove"
            label="Remove this message"
            onPress={() => {
              removeOutgoing(message.id);
            }}
          />
          <MetaDot />
        </>
      );
    case 'sending':
    case 'sent':
      return null;
  }
}

export function PendingBubble({ message }: { readonly message: UnsentMessage }): ReactNode {
  const timeZone = useTimeZone();
  const body = pendingBody(message);
  const time = clock(message.queuedAt, timeZone);
  const live = useSyncStatus().status === 'live';
  const status = statusOf(message, live);
  return (
    <View className="items-end">
      <View
        accessible
        accessibilityLabel={`You, ${time}, ${status}: ${body}`}
        className={cn(ownBubbleClass('only'), OWN_PADDING)}
      >
        <Text variant="body">{body}</Text>
      </View>
      {message.phase === 'failed' ? (
        <View className={OWN_META_LINE}>
          <Text variant="caption" tone="critical" numberOfLines={2} accessibilityRole="alert">
            {message.error}
          </Text>
        </View>
      ) : null}
      <View className={OWN_META_LINE}>
        <UnsentActions message={message} />
        <View aria-hidden className="flex-row items-center gap-1">
          <Text variant="caption" tone="faint" className="tabular">
            {time}
          </Text>
          <DeliveryGlyph mark={MARK[message.phase]} />
        </View>
      </View>
    </View>
  );
}
