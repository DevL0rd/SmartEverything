import type { ReactNode } from 'react';
import { View } from 'react-native';
import { count } from '../format/number';
import { ProgressBar } from './charts/progress-bar';
import { Text } from './text';

export interface BulkProgressLineProps {
  readonly verb: string;
  readonly done: number;
  readonly total: number;
  readonly onContainer: boolean;
}

export function bulkProgressText(verb: string, done: number, total: number): string {
  return `${verb} ${count(done)} of ${count(total)}`;
}

export function BulkProgressLine({
  verb,
  done,
  total,
  onContainer,
}: BulkProgressLineProps): ReactNode {
  const text = bulkProgressText(verb, done, total);
  return (
    <View testID="bulk-progress" className="w-full gap-1 px-2 pb-1">
      <Text
        variant="caption"
        tone={onContainer ? 'onPrimaryContainer' : 'variant'}
        className="tabular-nums"
        numberOfLines={1}
      >
        {text}
      </Text>
      <ProgressBar
        progress={done / total}
        colour={onContainer ? 'on-primary-container' : 'primary'}
        label={text}
      />
    </View>
  );
}
