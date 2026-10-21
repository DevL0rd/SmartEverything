import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Icon } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { clock } from '../../../format/time';
import { cancelPending, type PendingMessage } from '../data/outbox';

export function PendingBubble({ message }: { readonly message: PendingMessage }): ReactNode {
  const files = message.attachments.length;
  const body =
    message.text === '' ? `${String(files)} file${files === 1 ? '' : 's'}` : message.text;
  return (
    <View
      accessible
      accessibilityLabel={`You, ${clock(message.queuedAt)}, waiting for connection: ${body}`}
      className="items-end gap-1 pt-1"
    >
      <View className="max-w-4/5 rounded-xl rounded-br-sm bg-primary-container px-4 py-2.5 opacity-80">
        <Text variant="body">{body}</Text>
      </View>
      <View className="flex-row items-center gap-1.5">
        <Text variant="caption" tone="variant" className="tabular">
          {clock(message.queuedAt)}
        </Text>
        <Icon name="clock" size={16} tone="variant" />
        <Text variant="caption" tone="variant">
          Waiting for connection
        </Text>
        <Interactive
          label="Cancel this message"
          onPress={() => {
            cancelPending(message.id);
          }}
          className="min-h-touch-min justify-center rounded-sm px-2"
          layerClassName="rounded-sm"
        >
          <Text variant="caption" tone="primary">
            Cancel
          </Text>
        </Interactive>
      </View>
    </View>
  );
}
