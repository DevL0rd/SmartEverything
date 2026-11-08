import type { PlannerLap, PlannerStopwatchRow } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { PlannerStopwatchAction } from '../../api/planner';
import { Button } from '../../components/button';
import { Card } from '../../components/card';
import { Text } from '../../components/text';
import type { Tone } from '../../components/tone';
import { notifyFailure } from '../../components/toast-store';
import { cn } from '../../design/cn';
import { useAreaWidth } from '../../design/size-class';
import { usePlannerClockWrites, usePlannerStopwatch } from '../planner/data';
import { ClockFrame } from './frame/clock-frame';
import { useHubOffline } from './frame/hub-status';
import { frameLayoutOf } from './frame/sections';
import { LapBars } from './lap-bars';
import { deltaText, deltaToneOf, lapRowsOf, lapTime, type LapRow } from './lap-model';
import { StopwatchFace } from './stopwatch-face';

const FAILED: Readonly<Record<PlannerStopwatchAction, string>> = {
  start: 'Couldn’t start the stopwatch',
  pause: 'Couldn’t pause the stopwatch',
  lap: 'Couldn’t add a lap',
  reset: 'Couldn’t reset the stopwatch',
};

function useStopwatchAct(): (action: PlannerStopwatchAction) => void {
  const writes = usePlannerClockWrites(null);
  return (action) => {
    background(
      writes.actOnStopwatch(action).catch(notifyFailure(FAILED[action])),
      'clock.stopwatch_action_failed',
    );
  };
}

function primaryOf(stopwatch: PlannerStopwatchRow | null): {
  readonly label: string;
  readonly action: PlannerStopwatchAction;
} {
  if (stopwatch?.running === true) return { label: 'Pause', action: 'pause' };
  const resumed = stopwatch !== null && stopwatch.accumulated_ms > 0;
  return { label: resumed ? 'Resume' : 'Start', action: 'start' };
}

function Controls({ stopwatch }: { readonly stopwatch: PlannerStopwatchRow | null }): ReactNode {
  const act = useStopwatchAct();
  const offline = useHubOffline();
  const running = stopwatch?.running === true;
  const started = running || (stopwatch?.accumulated_ms ?? 0) > 0;
  const primary = primaryOf(stopwatch);
  return (
    <View className="flex-row flex-wrap justify-center gap-3">
      <Button
        label="Lap"
        variant="outlined"
        size="lg"
        icon="flag"
        disabled={offline || !running}
        onPress={() => {
          act('lap');
        }}
      />
      <Button
        label={primary.label}
        variant="filled"
        size="lg"
        icon={running ? 'pause' : 'play'}
        disabled={offline}
        onPress={() => {
          act(primary.action);
        }}
      />
      <Button
        label="Reset"
        variant="outlined"
        size="lg"
        icon="reset"
        disabled={offline || !started}
        onPress={() => {
          act('reset');
        }}
      />
    </View>
  );
}

function Cell({
  text,
  tone = 'default',
  className,
}: {
  readonly text: string;
  readonly tone?: Tone;
  readonly className: string;
}): ReactNode {
  return (
    <Text variant="footnote" tone={tone} numberOfLines={1} className={cn('tabular', className)}>
      {text}
    </Text>
  );
}

function lapLabelOf(row: LapRow): string {
  const delta = row.delta === null ? '' : `, ${deltaText(row.delta)}`;
  return `Lap ${String(row.number)}, ${lapTime(row.split)}${delta}, total ${lapTime(row.total)}`;
}

const ROW = 'flex-row items-center gap-3 px-4';
const RULE = 'border-t-hairline border-outline-variant';

interface LapLineProps {
  readonly row: LapRow;
  readonly compact: boolean;
  readonly ruled: boolean;
}

function LapLine({ row, compact, ruled }: LapLineProps): ReactNode {
  return (
    <View
      accessible
      accessibilityLabel={lapLabelOf(row)}
      className={cn('min-h-10', ROW, ruled && RULE)}
    >
      <Cell
        text={compact ? `Lap ${String(row.number)}` : String(row.number)}
        tone="variant"
        className={compact ? 'w-14' : 'w-10'}
      />
      <Cell text={lapTime(row.split)} className="min-w-0 flex-1" />
      <Cell
        text={row.delta === null ? '·' : deltaText(row.delta)}
        tone={deltaToneOf(row.delta)}
        className="w-16 text-right"
      />
      <Cell text={lapTime(row.total)} tone="variant" className="w-20 text-right" />
    </View>
  );
}

function TableHead(): ReactNode {
  return (
    <View aria-hidden className={cn('min-h-8', ROW)}>
      <Cell text="Lap" tone="variant" className="w-10" />
      <Cell text="Time" tone="variant" className="min-w-0 flex-1" />
      <Cell text="Delta" tone="variant" className="w-16 text-right" />
      <Cell text="Total" tone="variant" className="w-20 text-right" />
    </View>
  );
}

function LapTable({
  laps,
  compact,
}: {
  readonly laps: readonly PlannerLap[];
  readonly compact: boolean;
}): ReactNode {
  return (
    <Card padding="none" className="overflow-hidden py-1">
      {compact ? null : <TableHead />}
      {lapRowsOf(laps).map((row, index) => (
        <LapLine key={row.number} row={row} compact={compact} ruled={!compact || index > 0} />
      ))}
    </Card>
  );
}

function Laps({
  laps,
  compact,
}: {
  readonly laps: readonly PlannerLap[];
  readonly compact: boolean;
}): ReactNode {
  if (laps.length === 0) {
    return (
      <Text variant="footnote" tone="variant" align="center">
        Press Lap while it runs to compare your laps.
      </Text>
    );
  }
  if (compact) {
    return (
      <View className="gap-4">
        <LapBars laps={laps} compact />
        <LapTable laps={laps} compact />
      </View>
    );
  }
  return (
    <View className="flex-row items-start gap-4">
      <View className="min-w-0 flex-1">
        <LapBars laps={laps} compact={false} />
      </View>
      <View className="w-96">
        <LapTable laps={laps} compact={false} />
      </View>
    </View>
  );
}

function subtitleOf(stopwatch: PlannerStopwatchRow | null): string {
  if (stopwatch?.running === true) return 'Running · same on every device';
  if (stopwatch !== null && stopwatch.accumulated_ms > 0) return 'Paused · same on every device';
  return 'Ready · same on every device';
}

function Dial({
  stopwatch,
  compact,
}: {
  readonly stopwatch: PlannerStopwatchRow | null;
  readonly compact: boolean;
}): ReactNode {
  const body = (
    <View className="items-center gap-4 py-4">
      <StopwatchFace stopwatch={stopwatch} compact={compact} />
      <Controls stopwatch={stopwatch} />
    </View>
  );
  return compact ? body : <Card>{body}</Card>;
}

export function StopwatchPage(): ReactNode {
  const stopwatch = usePlannerStopwatch(null);
  const compact = frameLayoutOf(useAreaWidth()) === 'compact';
  return (
    <ClockFrame section="stopwatch" subtitle={subtitleOf(stopwatch)}>
      <View className="gap-4">
        <Dial stopwatch={stopwatch} compact={compact} />
        <Laps laps={stopwatch?.laps ?? []} compact={compact} />
      </View>
    </ClockFrame>
  );
}
