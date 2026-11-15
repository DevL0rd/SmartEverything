import type { BrushingSession } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Badge } from '../../../components/badge';
import { Icon } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import {
  EXCESS_WORD,
  hasExcess,
  localTime,
  resultOf,
  sessionLine,
  sessionTitle,
} from '../model/session-model';

export function SessionRow({
  session,
  onPress,
}: {
  readonly session: BrushingSession;
  readonly onPress: () => void;
}): ReactNode {
  const result = resultOf(session);
  const line = hasExcess(session)
    ? `${sessionLine(session)} · ${EXCESS_WORD}`
    : sessionLine(session);
  return (
    <Interactive
      role="button"
      label={`${sessionTitle(session)}, ${localTime(session)}, ${line}, ${result.word}`}
      onPress={onPress}
      className="min-h-11 flex-row items-center gap-3 rounded-md bg-surface-1 p-3"
    >
      <View className="min-w-0 flex-1">
        <Text variant="body-strong" numberOfLines={1}>
          {sessionTitle(session)}
        </Text>
        <Text variant="footnote" tone="variant" className="tabular" numberOfLines={2}>
          {localTime(session)} · {line}
        </Text>
      </View>
      <View className="shrink-0">
        <Badge label={result.word} tone={result.tone} />
      </View>
      <Icon name="chevronRight" size={20} tone="faint" />
    </Interactive>
  );
}
