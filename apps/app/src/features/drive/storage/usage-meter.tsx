import type { ReactNode } from 'react';
import { View } from 'react-native';
import { SegmentBar } from '../../../components/charts';
import { Text } from '../../../components/text';
import { bytes } from '../../../format/number';
import type { UsageLine } from './usage-model';

export interface UsageMeterProps {
  readonly leading: ReactNode;
  readonly title: string;
  readonly line: UsageLine;
  readonly note?: string | undefined;
  readonly trailing?: ReactNode;
  readonly action?: ReactNode;
}

function Foot({ note, action }: Pick<UsageMeterProps, 'note' | 'action'>): ReactNode {
  if (note === undefined && action === undefined) return null;
  return (
    <View className="flex-row flex-wrap items-center justify-between gap-x-3 gap-y-2">
      {note === undefined ? null : (
        <Text variant="caption" tone="variant" className="min-w-0 shrink">
          {note}
        </Text>
      )}
      {action === undefined ? null : <View className="ml-auto">{action}</View>}
    </View>
  );
}

export function UsageMeter(props: UsageMeterProps): ReactNode {
  const { leading, title, line, note, trailing, action } = props;
  return (
    <View className="gap-2">
      <View className="flex-row items-center gap-3">
        {leading}
        <View className="min-w-0 flex-1">
          <Text variant="body-strong" numberOfLines={1}>
            {title}
          </Text>
          <Text variant="footnote" tone="variant" numberOfLines={1} className="tabular">
            {line.counts}
          </Text>
        </View>
        <Text variant="footnote" tone={line.tone} numberOfLines={1} className="tabular shrink-0">
          {line.used}
        </Text>
        {trailing}
      </View>
      <SegmentBar
        segments={line.segments}
        total={line.total}
        label={`${title} used`}
        format={bytes}
      />
      <Foot note={note} action={action} />
    </View>
  );
}
