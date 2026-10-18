import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Card } from '../../../components/card';
import { ProgressBar } from '../../../components/charts';
import { Text } from '../../../components/text';
import { count } from '../../../format/number';
import { countSpoken, type CountEntry } from '../model/notifications-model';

function CountRow({ entry }: { readonly entry: CountEntry }): ReactNode {
  return (
    <View
      accessible
      accessibilityLabel={`${entry.label}, ${countSpoken(entry.count, 0)}`}
      className="min-h-row-h justify-center gap-1"
    >
      <View className="flex-row items-center gap-3">
        <Text variant="callout" ellipsize="middle" className="min-w-0 flex-1">
          {entry.label}
        </Text>
        <Text variant="callout" tone="variant" className="tabular">
          {count(entry.count)}
        </Text>
      </View>
      <ProgressBar progress={entry.share} colour="viz-1" label={entry.label} />
    </View>
  );
}

export function CountCard({
  total,
  entries,
}: {
  readonly total: number;
  readonly entries: readonly CountEntry[];
}): ReactNode {
  return (
    <Card title="By app" icon="bell">
      <Text variant="footnote" tone="variant">
        {countSpoken(total, entries.length)}
      </Text>
      {entries.map((entry) => (
        <CountRow key={entry.key} entry={entry} />
      ))}
    </Card>
  );
}
