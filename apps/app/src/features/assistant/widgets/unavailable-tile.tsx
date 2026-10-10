import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { View } from 'react-native';
import { Logger } from '@smarteverything/logging';
import { IconWell } from '../../../components/icon-well';
import { Text } from '../../../components/text';
import { WIDGET_SURFACE } from '../../../components/widget-board';
import { cn } from '../../../design/cn';
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
    <View className={cn('w-full flex-row items-center gap-3 p-3', WIDGET_SURFACE)}>
      <IconWell icon="alert" colour="warning" />
      <View className="min-w-0 flex-1 gap-0.5">
        <Text variant="body-strong" numberOfLines={2}>
          {`Can’t show ${subject}`}
        </Text>
        <Text variant="footnote" tone="variant">
          {reason}
        </Text>
      </View>
    </View>
  );
}
