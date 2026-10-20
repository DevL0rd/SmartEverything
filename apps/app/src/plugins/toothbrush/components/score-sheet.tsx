import type { BrushingStats } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Sheet } from '../../../components/sheet';
import { Text } from '../../../components/text';
import { percent } from '../../../format/number';
import { scoreRows } from '../model/today-model';

export function ScoreSheet({
  open,
  onClose,
  consistency,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly consistency: BrushingStats['consistency'];
}): ReactNode {
  return (
    <Sheet open={open} onClose={onClose} title="How the score works" detents={['half']}>
      <View className="gap-4">
        <Text variant="callout" tone="variant">
          The score is out of 100 and looks at the last 30 days.
        </Text>
        {scoreRows(consistency).map((row) => (
          <View key={row.label} className="flex-row items-baseline justify-between gap-3">
            <View className="min-w-0 flex-1">
              <Text variant="body-strong">{row.label}</Text>
              <Text variant="footnote" tone="variant">
                Worth {String(row.weight)} points
              </Text>
            </View>
            <Text variant="body-strong" className="tabular">
              {row.rate === null ? 'No data' : percent(row.rate)}
            </Text>
          </View>
        ))}
        <Text variant="footnote" tone="variant">
          Without pressure data the other parts share the score.
        </Text>
      </View>
    </Sheet>
  );
}
