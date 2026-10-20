import type { TreadmillStateView } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Text } from '../../../components/text';
import { useLiveSelect } from '../data/treadmill-data';
import { inclineReadoutOf, type InclineReadout } from '../model/widget-model';

interface Props {
  readonly deviceId: string;
  readonly view: TreadmillStateView;
}

export function useInclineReadout({ deviceId, view }: Props): InclineReadout | null {
  const frame = useLiveSelect(deviceId, view.frame, (live) => live);
  return inclineReadoutOf(frame, view.limits.incline);
}

function growOf(fill: number): { readonly flexGrow: number } {
  return { flexGrow: fill };
}

function Track({ fill }: { readonly fill: number }): ReactNode {
  return (
    <View aria-hidden className="h-1.5 flex-row overflow-hidden rounded-full bg-surface-3">
      <View style={growOf(fill)} className="h-full basis-0 rounded-full bg-viz-violet" />
      <View style={growOf(1 - fill)} className="h-full basis-0" />
    </View>
  );
}

export function InclineBlock(props: Props): ReactNode {
  const readout = useInclineReadout(props);
  if (readout === null) {
    return null;
  }
  return (
    <View accessible accessibilityLabel={readout.sentence} className="min-w-0 gap-1">
      <View className="flex-row items-baseline justify-between gap-2">
        <Text variant="caption" tone="variant" numberOfLines={1}>
          Incline
        </Text>
        <Text variant="body-strong" className="tabular" numberOfLines={1}>
          {readout.value}
        </Text>
      </View>
      <Track fill={readout.fill} />
      {readout.note === null ? null : (
        <Text variant="caption" tone="variant" numberOfLines={1} className="tabular">
          {readout.note}
        </Text>
      )}
    </View>
  );
}

export function InclineLine(props: Props): ReactNode {
  const readout = useInclineReadout(props);
  if (readout === null) {
    return null;
  }
  return (
    <View
      accessible
      accessibilityLabel={readout.sentence}
      className="min-w-0 shrink flex-row items-center gap-1.5"
    >
      <View aria-hidden className="size-2 rounded-full bg-viz-violet" />
      <Text variant="caption" numberOfLines={1} className="tabular min-w-0 shrink">
        {readout.climb === null ? readout.value : `${readout.value} · ${readout.climb}`}
      </Text>
    </View>
  );
}
