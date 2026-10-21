import type { ReactNode } from 'react';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Icon } from '../../../components/icon';
import { IconButton } from '../../../components/icon-button';
import { Text } from '../../../components/text';
import {
  cancelPending,
  removePending,
  useDeliveringMessages,
  usePendingMessages,
} from '../data/outbox';
import type { PendingMessage } from '../data/outbox';
import { queuedLabel, trayRowOf, type TrayRow } from '../model/composer-state';

const OPEN_UP_TO = 3;

const EDIT_BLOCKED = 'Finish or clear your message to edit this one';

function RowActions({
  message,
  body,
  row,
  onEdit,
}: {
  readonly message: PendingMessage;
  readonly body: string;
  readonly row: TrayRow;
  readonly onEdit: (message: PendingMessage) => void;
}): ReactNode {
  return (
    <>
      {row.edit === 'absent' ? null : (
        <IconButton
          icon="pencil"
          label={row.edit === 'blocked' ? EDIT_BLOCKED : `Edit “${body}”`}
          disabled={row.edit === 'blocked'}
          onPress={(): void => {
            cancelPending(message.id);
            onEdit(message);
          }}
        />
      )}
      {row.remove ? (
        <IconButton
          icon="close"
          label={`Remove “${body}”`}
          onPress={(): void => {
            removePending(message);
          }}
        />
      ) : null}
    </>
  );
}

function TrayItem({
  message,
  fieldHasText,
  delivering,
  onEdit,
}: {
  readonly message: PendingMessage;
  readonly fieldHasText: boolean;
  readonly delivering: boolean;
  readonly onEdit: (message: PendingMessage) => void;
}): ReactNode {
  const body = queuedLabel(message.text, message.attachments.length);
  const row = trayRowOf(message, { fieldHasText, delivering });
  return (
    <View>
      <View className="h-hairline bg-outline-variant" />
      <View className="min-h-touch-min flex-row items-center gap-1.5 pl-3 pr-1">
        <Icon name="clock" size={16} tone="variant" />
        <Text variant="callout" numberOfLines={1} className="min-w-0 flex-1">
          {row.text}
        </Text>
        <RowActions message={message} body={body} row={row} onEdit={onEdit} />
      </View>
    </View>
  );
}

export function QueueTray({
  chatId,
  fieldHasText,
  onEdit,
}: {
  readonly chatId: string;
  readonly fieldHasText: boolean;
  readonly onEdit: (message: PendingMessage) => void;
}): ReactNode {
  const messages = usePendingMessages(chatId);
  const delivering = useDeliveringMessages();
  const [open, setOpen] = useState<boolean | null>(null);
  if (messages.length === 0) return null;
  const expanded = open ?? messages.length <= OPEN_UP_TO;
  return (
    <View
      accessibilityRole="summary"
      aria-label="Queued messages"
      className="overflow-hidden rounded-lg bg-surface-2"
    >
      <View className="min-h-touch-min flex-row items-center gap-2 pl-3 pr-1">
        <Icon name="layers" size={16} />
        <Text variant="footnote" className="min-w-0 flex-1 font-sans-semibold">
          {`Queued · ${String(messages.length)}`}
        </Text>
        <IconButton
          icon={expanded ? 'chevronDown' : 'chevronUp'}
          label={expanded ? 'Collapse queue' : 'Expand queue'}
          onPress={(): void => {
            setOpen(!expanded);
          }}
        />
      </View>
      {expanded ? (
        <ScrollView className="max-h-36" keyboardShouldPersistTaps="handled">
          {messages.map((message) => (
            <TrayItem
              key={message.id}
              message={message}
              fieldHasText={fieldHasText}
              delivering={delivering.has(message.id)}
              onEdit={onEdit}
            />
          ))}
        </ScrollView>
      ) : null}
    </View>
  );
}
