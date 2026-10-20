import type { BrushStateView, BrushingStats } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import { Card } from '../../../components/card';
import { Rings } from '../../../components/charts';
import { EmptyState } from '../../../components/empty-state';
import { Icon } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { useBrushView } from '../data/brush-data';
import { scoreWord, streakLine, todayLine, todayRings } from '../model/today-model';
import { ScoreSheet } from './score-sheet';

const RING_PX = 112;

type Today = NonNullable<BrushStateView['today']>;

function Legend({ today }: { readonly today: Today }): ReactNode {
  return (
    <View className="min-w-0 flex-1 gap-2">
      {todayRings(today).map((ring) => (
        <View
          key={ring.label}
          accessible
          accessibilityLabel={ring.label}
          className="flex-row items-center gap-2"
        >
          <View className={cn('size-2.5 rounded-full', ring.dot)} />
          <Text variant="callout" className="min-w-0 flex-1" numberOfLines={2}>
            {ring.label}
          </Text>
        </View>
      ))}
      <View className="flex-row gap-3">
        <PartDot done={today.morning} label="Morning" />
        <PartDot done={today.evening} label="Evening" />
      </View>
    </View>
  );
}

function PartDot({ done, label }: { readonly done: boolean; readonly label: string }): ReactNode {
  return (
    <View
      accessible
      accessibilityLabel={`${label} ${done ? 'brushed' : 'not yet'}`}
      className="flex-row items-center gap-1"
    >
      <Icon name={done ? 'circleCheck' : 'circle'} size={16} tone={done ? 'positive' : 'faint'} />
      <Text variant="caption" tone="variant">
        {label}
      </Text>
    </View>
  );
}

function ScoreTile({
  score,
  consistency,
}: {
  readonly score: number | null;
  readonly consistency: BrushingStats['consistency'];
}): ReactNode {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Interactive
        label={`Brushing score ${score === null ? 'not available' : String(score)}. How is it worked out?`}
        hint="Shows how the score is worked out"
        onPress={() => {
          setOpen(true);
        }}
        className="min-h-11 flex-row items-center gap-3 rounded-md bg-surface-2 px-3 py-2"
      >
        <Text variant="title-2" className="tabular">
          {score === null ? '–' : String(score)}
        </Text>
        <View className="min-w-0 flex-1">
          <Text variant="body-strong">{scoreWord(score)}</Text>
        </View>
        <Text variant="callout" tone="primary">
          How?
        </Text>
      </Interactive>
      <ScoreSheet
        open={open}
        onClose={() => {
          setOpen(false);
        }}
        consistency={consistency}
      />
    </>
  );
}

function Body({
  view,
  today,
  stats,
}: {
  readonly view: BrushStateView;
  readonly today: Today;
  readonly stats: BrushingStats | null;
}): ReactNode {
  const streak = view.streak ?? 0;
  return (
    <View className="gap-4">
      <View className="flex-row items-center gap-4">
        <Rings size={RING_PX} rings={todayRings(today)} />
        <Legend today={today} />
      </View>
      <Text variant="callout">{todayLine(today)}</Text>
      <View className="flex-row items-center gap-2">
        <Icon name="flame" size={20} tone={streak > 0 ? 'warning' : 'faint'} />
        <Text variant="callout">{streakLine(streak, stats?.bests.longestStreak ?? streak)}</Text>
      </View>
      {stats === null ? null : <ScoreTile score={view.score} consistency={stats.consistency} />}
    </View>
  );
}

export function TodayCard({
  deviceId,
  view,
}: {
  readonly deviceId: string;
  readonly view: BrushStateView;
}): ReactNode {
  const stats = useBrushView(deviceId, 'stats', { range: 'month' }, view.mine);
  const { today } = view;
  if (!view.mine || today === null) {
    return (
      <Card title="Today" icon="calendar">
        <EmptyState
          compact
          icon="eyeOff"
          title={
            view.personName === null
              ? 'Sessions are private'
              : `Sessions belong to ${view.personName}`
          }
          body="Only the person this brush is set up for sees the brushing history."
        />
      </Card>
    );
  }
  return (
    <Card title="Today" icon="calendar">
      <Body view={view} today={today} stats={stats.data?.stats ?? null} />
    </Card>
  );
}
