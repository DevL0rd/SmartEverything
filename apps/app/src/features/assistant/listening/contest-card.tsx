import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { ListeningSource, WakeArbitrated } from '@smarteverything/domain';
import { Badge } from '../../../components/badge';
import { Card } from '../../../components/card';
import { Icon } from '../../../components/icon';
import { Text } from '../../../components/text';
import { relative } from '../../../format/time';
import { useMinute } from '../../../store/clock';
import { cn } from '../../../design/cn';
import { ContestTimeline } from './contest-timeline';
import {
  OUTCOME_LABELS,
  contestOf,
  outcomeWon,
  type ClaimOutcome,
  type ContestLine,
  type ContestModel,
} from './contest-model';
import { dbLabel, levelShare } from './listening-model';
import { NumberDot } from './number-dot';

const OUTCOME_TONE = {
  answered: 'positive',
  took_over: 'positive',
  handed_over: 'variant',
  stood_down: 'variant',
  late: 'faint',
} as const satisfies Record<ClaimOutcome, 'positive' | 'variant' | 'faint'>;

const GHOST_BARS = [6, 10, 14, 8, 4].map((height) => ({ height }));

function growOf(share: number): { readonly flexGrow: number } {
  return { flexGrow: share };
}

export function LoudnessBar({
  dbfs,
  won,
}: {
  readonly dbfs: number;
  readonly won: boolean;
}): ReactNode {
  const share = levelShare(dbfs);
  return (
    <View aria-hidden className="h-2 flex-1 flex-row overflow-hidden rounded-full bg-surface-3">
      <View
        style={growOf(share)}
        className={cn('rounded-full', won ? 'bg-primary' : 'bg-on-surface-faint')}
      />
      <View style={growOf(1 - share)} />
    </View>
  );
}

function ClaimLine({
  line,
  index,
}: {
  readonly line: ContestLine;
  readonly index: number;
}): ReactNode {
  const won = outcomeWon(line.outcome);
  return (
    <View className="gap-1.5">
      <View className="flex-row items-center gap-2">
        <NumberDot number={index + 1} outcome={line.outcome} />
        <Text
          variant="callout"
          tone={won ? 'default' : 'variant'}
          numberOfLines={1}
          className="min-w-0 flex-1"
        >
          {line.name}
        </Text>
        <Text variant="caption" tone={OUTCOME_TONE[line.outcome]}>
          {OUTCOME_LABELS[line.outcome]}
        </Text>
      </View>
      <View className="flex-row items-center gap-2 pl-8">
        <LoudnessBar dbfs={line.dbfs} won={won} />
        <Text
          variant="footnote"
          tone={won ? 'default' : 'variant'}
          align="end"
          className="tabular w-14"
        >
          {dbLabel(line.dbfs)}
        </Text>
      </View>
    </View>
  );
}

function Head({ at, offline }: { readonly at: string; readonly offline: boolean }): ReactNode {
  const now = useMinute();
  return (
    <View className="flex-row items-center gap-2">
      <Icon name="clock" size={20} />
      <Text variant="title-3" accessibilityRole="header" className="flex-1">
        Last wake
      </Text>
      <Text variant="footnote" tone="variant">
        {`${offline ? 'Saved · ' : ''}${relative(at, now)}`}
      </Text>
    </View>
  );
}

function Filled({
  model,
  offline,
}: {
  readonly model: ContestModel;
  readonly offline: boolean;
}): ReactNode {
  return (
    <>
      <Head at={model.at} offline={offline} />
      <View className="flex-row flex-wrap items-center gap-2">
        <Text variant="body-strong" numberOfLines={2} className="shrink">
          {model.title}
        </Text>
        {model.badge === null ? null : <Badge label={model.badge} tone="primary" icon="star" />}
      </View>
      <Text variant="footnote" tone="variant">
        {model.summary}
      </Text>
      {model.lines.length > 1 ? (
        <ContestTimeline lines={model.lines} axisMs={model.axisMs} />
      ) : null}
      <View accessibilityLabel="Who heard it" className="gap-3">
        {model.lines.map((line, index) => (
          <ClaimLine key={`${line.name}-${String(line.afterMs)}`} line={line} index={index} />
        ))}
      </View>
      <View className="flex-row justify-between">
        <Text variant="caption" tone="faint">
          {'−60 dB quieter'}
        </Text>
        <Text variant="caption" tone="faint">
          louder 0 dB
        </Text>
      </View>
    </>
  );
}

function Empty({ name }: { readonly name: string }): ReactNode {
  return (
    <>
      <View className="flex-row items-center gap-2">
        <Icon name="clock" size={20} />
        <Text variant="title-3" accessibilityRole="header">
          Last wake
        </Text>
      </View>
      <View className="flex-row items-center gap-3">
        <View aria-hidden className="w-14 flex-row items-center justify-center gap-0.5">
          {GHOST_BARS.map((bar) => (
            <View key={bar.height} style={bar} className="w-1 rounded-xs bg-surface-3" />
          ))}
        </View>
        <View className="min-w-0 flex-1 gap-0.5">
          <Text variant="body">No wake yet.</Text>
          <Text variant="footnote" tone="variant">
            {`The first “${name}” a device hears shows up here, with who answered and why.`}
          </Text>
        </View>
      </View>
    </>
  );
}

export function ContestCard({
  last,
  sources,
  name,
  offline,
}: {
  readonly last: WakeArbitrated | null;
  readonly sources: readonly ListeningSource[];
  readonly name: string;
  readonly offline: boolean;
}): ReactNode {
  const model = last === null ? null : contestOf(last, sources);
  return (
    <Card>
      {model === null ? <Empty name={name} /> : <Filled model={model} offline={offline} />}
    </Card>
  );
}
