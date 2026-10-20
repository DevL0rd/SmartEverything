import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { StateTimeline } from '../../../../components/charts/state-timeline';
import { Button } from '../../../../components/button';
import { Interactive } from '../../../../components/interactive';
import { Slider } from '../../../../components/slider';
import { Text } from '../../../../components/text';
import { cn } from '../../../../design/cn';
import type { ColourRole } from '../../../../design/tokens';
import { durationLabel } from '../run-history-model';
import { offsetOf, type RowState, type TimelineModel, type TimelineRow } from './run-timeline';

const COLOURS: Readonly<Record<RowState, ColourRole>> = {
  ok: 'positive',
  failed: 'critical',
  running: 'primary',
  waiting: 'info',
  skipped: 'outline',
};

const ROW_HEIGHT = 14;
const SCRUB_STEPS = 400;

export interface TimelineBandProps {
  readonly model: TimelineModel;
  readonly at: number | null;
  readonly selected: string | null;
  readonly onScrub: (at: number | null) => void;
  readonly onSelect: (nodeId: string) => void;
}

function Row({
  row,
  from,
  to,
  at,
  selected,
  onSelect,
}: {
  readonly row: TimelineRow;
  readonly from: number;
  readonly to: number;
  readonly at: number | null;
  readonly selected: boolean;
  readonly onSelect: (nodeId: string) => void;
}): ReactNode {
  return (
    <Interactive
      label={`${row.title}, show its details`}
      selected={selected}
      onPress={() => {
        onSelect(row.nodeId);
      }}
      className={cn(
        'min-h-touch-min flex-row items-center gap-2 rounded-sm px-1',
        selected && 'bg-surface-2',
      )}
    >
      <Text variant="caption" tone="variant" numberOfLines={1} className="w-24">
        {row.title}
      </Text>
      <View className="min-w-0 flex-1">
        <StateTimeline
          segments={row.segments}
          colours={COLOURS}
          label={`${row.title} activations`}
          height={ROW_HEIGHT}
          from={from}
          to={to}
          ticks={at === null ? [] : [at]}
          track="surface-2"
        />
      </View>
    </Interactive>
  );
}

function Scrubber({
  model,
  at,
  onScrub,
}: Pick<TimelineBandProps, 'model' | 'at' | 'onScrub'>): ReactNode {
  const { from, to } = model.bounds;
  const span = to - from;
  const move = (offset: number): void => {
    onScrub(from + offset);
  };
  return (
    <Slider
      label="Replay position"
      value={offsetOf(at, model.bounds)}
      min={0}
      max={span}
      step={Math.max(1, Math.round(span / SCRUB_STEPS))}
      formatValue={durationLabel}
      onChange={move}
      onCommit={move}
    />
  );
}

export function TimelineBand({
  model,
  at,
  selected,
  onScrub,
  onSelect,
}: TimelineBandProps): ReactNode {
  const { from, to } = model.bounds;
  return (
    <View className="gap-2 rounded-md bg-surface-1 p-3">
      <View className="flex-row items-center justify-between gap-2">
        <Text variant="footnote" tone="variant" accessibilityRole="header">
          Timeline
        </Text>
        {at === null ? null : (
          <Button
            label="Show the end"
            variant="text"
            onPress={() => {
              onScrub(null);
            }}
          />
        )}
      </View>
      <Scrubber model={model} at={at} onScrub={onScrub} />
      <ScrollView className="max-h-48">
        <View className="gap-1">
          {model.rows.map((row) => (
            <Row
              key={row.nodeId}
              row={row}
              from={from}
              to={to}
              at={at}
              selected={row.nodeId === selected}
              onSelect={onSelect}
            />
          ))}
        </View>
      </ScrollView>
    </View>
  );
}
