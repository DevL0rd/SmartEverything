import type { TreadmillSession } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Badge } from '../../../components/badge';
import { Icon } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { KIND_LABEL, sessionLine, sessionTitle, whenText } from '../model/session-model';
import { ZoneStrip } from './zone-bar';

export function SessionRow({
  session,
  today,
  onPress,
}: {
  readonly session: TreadmillSession;
  readonly today: string;
  readonly onPress: () => void;
}): ReactNode {
  return (
    <Interactive
      role="button"
      label={`${sessionTitle(session)}, ${whenText(session, today)}, ${sessionLine(session)}`}
      onPress={onPress}
      className="min-h-touch-min gap-2 rounded-md bg-surface-1 p-3"
    >
      <View className="flex-row items-center gap-3">
        <View className="min-w-0 flex-1">
          <Text variant="body-strong" numberOfLines={1}>
            {sessionTitle(session)}
          </Text>
          <Text variant="footnote" tone="variant" className="tabular" numberOfLines={1}>
            {whenText(session, today)} · {sessionLine(session)}
          </Text>
        </View>
        <View className="shrink-0">
          <Badge label={KIND_LABEL[session.kind]} tone="primary" />
        </View>
        <Icon name="chevronRight" size={20} tone="faint" />
      </View>
      <ZoneStrip zones={session.zones} />
    </Interactive>
  );
}
