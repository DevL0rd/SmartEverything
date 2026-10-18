import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Badge } from '../../components/badge';
import { Icon } from '../../components/icon';
import { Interactive } from '../../components/interactive';
import { Text } from '../../components/text';
import { joinParts } from '../../format/text';
import { clock } from '../../format/time';
import {
  deviceName,
  OUTCOME_LOOK,
  OUTCOME_TEXT,
  plainDomain,
  type LookupItem,
} from './query-outcome';

export function QueryRow({
  item,
  onPress,
}: {
  readonly item: LookupItem;
  readonly onPress: () => void;
}): ReactNode {
  const { query } = item;
  const domain = plainDomain(query.domain);
  const outcome = OUTCOME_TEXT[query.outcome];
  return (
    <Interactive
      label={joinParts([domain, outcome, deviceName(query), clock(query.time)])}
      onPress={onPress}
      className="min-h-row-h-2 flex-row items-start gap-3 px-4 py-2"
    >
      <Text variant="footnote" tone="variant" className="tabular w-16 pt-0.5">
        {clock(query.time)}
      </Text>
      <View className="min-w-0 flex-1 gap-0.5">
        <Text variant="body" ellipsize="middle">
          {domain}
        </Text>
        <View className="flex-row flex-wrap items-center gap-x-2 gap-y-0.5">
          <Text variant="callout" tone="variant" numberOfLines={1} className="shrink">
            {deviceName(query)}
          </Text>
          {query.outcome === 'allowed' ? null : (
            <Badge label={outcome} icon={OUTCOME_LOOK[query.outcome].icon} />
          )}
        </View>
      </View>
      <View className="h-6 justify-center">
        <Icon name="chevronRight" size={20} tone="faint" />
      </View>
    </Interactive>
  );
}
