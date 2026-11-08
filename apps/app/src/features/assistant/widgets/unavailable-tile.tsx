import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { View } from 'react-native';
import { Logger } from '@smarteverything/logging';
import { Icon } from '../../../components/icon';
import { Text } from '../../../components/text';
import type { UnavailableEntry } from './lane-entries';

const log = new Logger('app.chat-widgets');

export function UnavailableTile({ entry }: { readonly entry: UnavailableEntry }): ReactNode {
  const { subject, reason, cause } = entry;
  useEffect(() => {
    if (cause === null) {
      log.warn('chat_widgets.unavailable', { subject, reason });
      return;
    }
    log.error('chat_widgets.resolve_failed', cause, { subject });
  }, [subject, reason, cause]);
  return (
    <View className="min-h-5 w-full flex-row items-center gap-1.5">
      <Icon name="alert" size={16} tone="warning" />
      <Text variant="footnote" tone="variant" className="min-w-0 flex-1">
        {`Can’t show ${subject}`}
        <Text variant="footnote" tone="faint">{` · ${reason}`}</Text>
      </Text>
    </View>
  );
}
