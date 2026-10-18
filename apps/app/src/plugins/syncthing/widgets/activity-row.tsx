import type { SyncActivity, SyncthingSnapshot } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Icon } from '../../../components/icon';
import { Text } from '../../../components/text';
import { clock } from '../../../format/time';
import { activityLineOf, type ActivityLine } from './activity-model';

function Title({ line }: { readonly line: ActivityLine }): ReactNode {
  if (!line.file) {
    return (
      <Text variant="body" numberOfLines={1}>
        {`${line.word} ${line.name}`}
      </Text>
    );
  }
  return (
    <View className="flex-row items-baseline gap-1.5">
      <Text variant="body" className="flex-none">
        {line.word}
      </Text>
      <View className="min-w-0 flex-1">
        <Text variant="body" ellipsize="middle">
          {line.name}
        </Text>
      </View>
    </View>
  );
}

function Detail({ line }: { readonly line: ActivityLine }): ReactNode {
  if (line.detail === null) {
    return null;
  }
  return line.detailPath ? (
    <Text variant="footnote" tone="variant" ellipsize="middle">
      {line.detail}
    </Text>
  ) : (
    <Text variant="footnote" tone="variant" numberOfLines={1}>
      {line.detail}
    </Text>
  );
}

export function ActivityRow({
  entry,
  known,
}: {
  readonly entry: SyncActivity;
  readonly known: SyncthingSnapshot | null;
}): ReactNode {
  const line = activityLineOf(entry, known);
  const time = clock(entry.at);
  return (
    <View
      accessible
      accessibilityLabel={`${line.word} ${line.name}, ${time}`}
      className="min-h-row-h flex-row items-start gap-3 px-4 py-3"
    >
      <View className="pt-0.5">
        <Icon name={line.icon} size={20} tone={line.critical ? 'critical' : 'variant'} />
      </View>
      <View className="min-w-0 flex-1 gap-0.5">
        <Title line={line} />
        <Detail line={line} />
      </View>
      <Text variant="footnote" tone="variant" className="tabular flex-none">
        {time}
      </Text>
    </View>
  );
}
