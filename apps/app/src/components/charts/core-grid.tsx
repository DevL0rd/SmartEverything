import type { ReactNode } from 'react';
import { memo, useId, useState } from 'react';
import { View } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { useColour } from '../../design/colour';
import { useIdiom } from '../../design/platform';
import { Text } from '../text';
import { useMeasuredWidth } from '../use-measured-width';
import { scrubGesture, type ScrubPoint } from './chart-parts';
import {
  HEAT_FROM,
  barIndexAt,
  barLayout,
  coreSummary,
  groupsOf,
  heatIndexAt,
  heatLayout,
  selectedBar,
  selectedCell,
  threadLine,
  type CoreGroup,
} from './core-grid-model';

export interface CoreGridProps {
  readonly values: readonly number[];
  readonly groups?: readonly CoreGroup[];
  readonly height?: number;
  readonly caption?: boolean;
}

const DEFAULT_HEIGHT = 72;
const GROUP_LABEL_ROOM = 18;
const SELECT_WIDTH = 1.5;
const RAMP_HEIGHT = 8;
const HINT = 'Hover or press and hold a thread to see its load';

interface StripProps {
  readonly values: readonly number[];
  readonly width: number;
  readonly selected: number | null;
  readonly select: (index: number | null) => void;
  readonly label: string;
}

function GroupLabels({
  groups,
  slot,
  top,
}: {
  readonly groups: readonly CoreGroup[];
  readonly slot: number;
  readonly top: number;
}): ReactNode {
  return groups.map((group) => {
    const place = { left: group.from * slot, top };
    return (
      <View key={group.label} pointerEvents="none" style={place} className="absolute">
        <Text variant="caption" tone="variant" numberOfLines={1}>
          {group.label}
        </Text>
      </View>
    );
  });
}

function BarStrip({
  values,
  width,
  selected,
  select,
  label,
  groups,
  height,
}: StripProps & {
  readonly groups: readonly CoreGroup[] | undefined;
  readonly height: number;
}): ReactNode {
  const track = useColour('surface-3');
  const fill = useColour('viz-blue');
  const edge = useColour('on-surface');
  const pointer = useIdiom() === 'pointer';
  const layout = barLayout(values, width, height);
  const room = groups === undefined ? 0 : GROUP_LABEL_ROOM;
  const box = { height: height + room };
  const gesture = scrubGesture(pointer, (point) => {
    select(point === null ? null : barIndexAt(point.x, layout.slot, values.length));
  });
  return (
    <GestureDetector gesture={gesture}>
      <View
        accessible
        accessibilityRole="image"
        accessibilityLabel={label}
        style={box}
        className="relative w-full"
      >
        <Svg width={width} height={height}>
          <Path d={layout.tracks} fill={track} />
          <Path d={layout.bars} fill={fill} />
          {selected === null ? null : (
            <Path
              d={selectedBar(selected, layout.slot, height)}
              fill="none"
              stroke={edge}
              strokeWidth={SELECT_WIDTH}
            />
          )}
        </Svg>
        {groups === undefined ? null : (
          <GroupLabels groups={groups} slot={layout.slot} top={height + 2} />
        )}
      </View>
    </GestureDetector>
  );
}

function HeatGroup({
  values,
  group,
  width,
  selected,
  select,
}: Omit<StripProps, 'label'> & { readonly group: CoreGroup }): ReactNode {
  const fill = useColour('viz-blue');
  const edge = useColour('on-surface');
  const pointer = useIdiom() === 'pointer';
  const members = values.slice(group.from, group.to);
  const layout = heatLayout(members, width);
  const box = { height: layout.height };
  const local = selected === null ? -1 : selected - group.from;
  const gesture = scrubGesture(pointer, (point: ScrubPoint | null) => {
    const index = point === null ? null : heatIndexAt(point, layout.cell, members.length);
    select(index === null ? null : group.from + index);
  });
  return (
    <View className="gap-1">
      <Text variant="caption" tone="variant">
        {group.label}
      </Text>
      <GestureDetector gesture={gesture}>
        <View style={box} className="w-full">
          <Svg width={width} height={layout.height}>
            {layout.levels.map((level) => (
              <Path key={level.opacity} d={level.d} fill={fill} fillOpacity={level.opacity} />
            ))}
            {local >= 0 && local < members.length ? (
              <Path
                d={selectedCell(local, layout.cell)}
                fill="none"
                stroke={edge}
                strokeWidth={SELECT_WIDTH}
              />
            ) : null}
          </Svg>
        </View>
      </GestureDetector>
    </View>
  );
}

function HeatRamp(): ReactNode {
  const fill = useColour('viz-blue');
  const id = useId();
  return (
    <View aria-hidden className="flex-row items-center gap-2">
      <Text variant="caption" tone="variant">
        Idle
      </Text>
      <View className="flex-1">
        <Svg width="100%" height={RAMP_HEIGHT}>
          <Defs>
            <LinearGradient id={id} x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor={fill} stopOpacity={0.1} />
              <Stop offset="1" stopColor={fill} stopOpacity={1} />
            </LinearGradient>
          </Defs>
          <Rect width="100%" height={RAMP_HEIGHT} rx={RAMP_HEIGHT / 2} fill={`url(#${id})`} />
        </Svg>
      </View>
      <Text variant="caption" tone="variant">
        Busy
      </Text>
    </View>
  );
}

export const CoreGrid = memo(function CoreGrid({
  values,
  groups,
  height = DEFAULT_HEIGHT,
  caption = true,
}: CoreGridProps): ReactNode {
  const { width, onLayout } = useMeasuredWidth();
  const [selected, setSelected] = useState<number | null>(null);
  const label = coreSummary(values);
  const heat = values.length >= HEAT_FROM;
  return (
    <View className="min-w-0 gap-1.5" onLayout={onLayout}>
      {width === 0 ? null : heat ? (
        <View accessible accessibilityRole="image" accessibilityLabel={label} className="gap-2">
          {groupsOf(values.length, groups).map((group) => (
            <HeatGroup
              key={group.label}
              values={values}
              group={group}
              width={width}
              selected={selected}
              select={setSelected}
            />
          ))}
          <HeatRamp />
        </View>
      ) : (
        <BarStrip
          values={values}
          width={width}
          selected={selected}
          select={setSelected}
          label={label}
          groups={groups}
          height={height}
        />
      )}
      {caption ? (
        <Text variant="caption" tone="variant" className="tabular">
          {threadLine(selected, values) ?? HINT}
        </Text>
      ) : null}
    </View>
  );
});
