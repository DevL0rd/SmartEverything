import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { AutomationRunSummary } from '@smarteverything/domain';
import { Badge } from '../../../components/badge';
import { Grid, useGridLayout } from '../../../components/grid';
import { Icon } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { CONTAINER_WIDTH } from '../../../design/tokens';
import { count as formatCount } from '../../../format/number';
import { clock, dayLabel } from '../../../format/time';
import {
  RUN_LABELS,
  durationLabel,
  nodeOutcomes,
  runLook,
  tookMs,
  triggerText,
  type RunDay,
} from './run-history-model';

const BAR_MAX = 96;
const BAR_MIN = 12;
const MAX_RUN_COLUMNS = 6;

function OutcomeBar({
  run,
  mostSteps,
}: {
  readonly run: AutomationRunSummary;
  readonly mostSteps: number;
}): ReactNode {
  const { ok, failed } = nodeOutcomes(run);
  const total = ok + failed;
  if (total === 0 || mostSteps === 0) return null;
  const width = Math.max(BAR_MIN, Math.round((total / mostSteps) * BAR_MAX));
  const frame = { width };
  const okShare = { flex: ok };
  const failedShare = { flex: failed };
  return (
    <View
      accessible
      accessibilityLabel={`${formatCount(ok)} steps done, ${formatCount(failed)} failed`}
      className="h-1.5 flex-row gap-0.5 overflow-hidden rounded-full"
      style={frame}
    >
      {ok > 0 ? <View className="rounded-full bg-primary" style={okShare} /> : null}
      {failed > 0 ? <View className="rounded-full bg-critical" style={failedShare} /> : null}
    </View>
  );
}

export interface RunRowProps {
  readonly run: AutomationRunSummary;
  readonly name: string | null;
  readonly zone: string | null;
  readonly mostSteps: number;
  readonly onOpen: (run: AutomationRunSummary) => void;
}

export function RunRow({ run, name, zone, mostSteps, onOpen }: RunRowProps): ReactNode {
  const look = runLook(run.status);
  const took = tookMs(run);
  const title = name ?? triggerText(run);
  const when = clock(run.created_at, zone);
  return (
    <Interactive
      label={`${title}, ${RUN_LABELS[run.status]}, ${when}`}
      onPress={() => {
        onOpen(run);
      }}
      className={cn(
        'min-h-touch-min flex-row items-center gap-3 rounded-md bg-surface-1 px-4 py-3',
        run.mode !== 'live' && 'opacity-90',
      )}
    >
      <Icon name={look.icon} size={20} tone={look.tone} />
      <View className="min-w-0 flex-1 gap-1">
        <Text variant="body-strong">{title}</Text>
        <Text variant="footnote" tone="variant">
          {name === null ? when : `${triggerText(run)} · ${when}`}
        </Text>
        {run.error === null ? null : (
          <Text variant="footnote" tone="critical" numberOfLines={2}>
            {run.error}
          </Text>
        )}
      </View>
      <View className="items-end gap-1.5">
        <View className="flex-row items-center gap-2">
          {run.mode === 'live' ? null : (
            <Badge label={run.mode === 'dry' ? 'Dry run' : 'Simulated'} tone="neutral" />
          )}
          <Text variant="callout" tone={look.tone} className="tabular">
            {took === null ? RUN_LABELS[run.status] : durationLabel(took)}
          </Text>
        </View>
        <OutcomeBar run={run} mostSteps={mostSteps} />
      </View>
    </Interactive>
  );
}

export interface RunDayGroupProps extends Omit<RunRowProps, 'run' | 'name'> {
  readonly day: RunDay;
  readonly now: number;
  readonly width: number;
  readonly nameOf: (run: AutomationRunSummary) => string | null;
}

export function RunDayGroup({ day, now, width, nameOf, ...rest }: RunDayGroupProps): ReactNode {
  const { columns } = useGridLayout(width, CONTAINER_WIDTH.reading, 'tight', MAX_RUN_COLUMNS);
  const rows = day.runs.map((run) => (
    <RunRow key={run.id} run={run} name={nameOf(run)} {...rest} />
  ));
  return (
    <View className={cn('w-full gap-2', columns === 1 && 'max-w-reading')}>
      <View
        className={cn('flex-row items-baseline gap-2 px-1', columns === 1 && 'justify-between')}
      >
        <Text variant="footnote" tone="variant" accessibilityRole="header">
          {dayLabel(day.first.created_at, now, rest.zone)}
        </Text>
        <Text variant="caption" tone={day.failed > 0 ? 'critical' : 'faint'} className="tabular">
          {day.failed > 0
            ? `${formatCount(day.runs.length)} runs, ${formatCount(day.failed)} failed`
            : `${formatCount(day.runs.length)} runs`}
        </Text>
      </View>
      {columns === 1 ? (
        rows
      ) : (
        <Grid
          minItemWidth={CONTAINER_WIDTH.reading}
          maxColumns={MAX_RUN_COLUMNS}
          measuredWidth={width}
          gap="tight"
          cellClassName="max-w-detail"
        >
          {rows}
        </Grid>
      )}
    </View>
  );
}
