import { useRef, useState, type ReactNode } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import { href } from '../../app-shell/hrefs';
import { Button } from '../../components/button';
import { EmptyGraph, ProgressBar, Rings, Sparkline } from '../../components/charts';
import { LevelPill } from '../../components/level-pill';
import { Text } from '../../components/text';
import { UNSET_FITNESS_GOALS, effectiveFitnessGoals } from '@smarteverything/domain';
import { useVisibleLive } from '../../design/use-visible-live';
import { count } from '../../format/number';
import { useActiveProfile } from '../../store/people';
import type { Device } from '../../store/state';
import { WideFigure } from '../devices';
import type { WatchGlance } from './watch-glance';
import { useOwnWatch } from './use-watch-heart';
import { syncNow } from './watch-link';
import { goalRingsOf, heartCaption, type SyncControl } from './watch-card-model';
import type { HeartView } from './watch-heart';
import { useDayFacts, useHeartToday } from './watch-health-data';
import { background } from '@smarteverything/logging';

const EMPTY_LINE = 16;

function useHeartRoom(cap: number): {
  readonly height: number | null;
  readonly onLayout: (event: LayoutChangeEvent) => void;
} {
  const [room, setRoom] = useState(cap);
  const height = Math.min(room, cap);
  return {
    height: height < EMPTY_LINE ? null : height,
    onLayout: (event): void => {
      setRoom(Math.max(0, Math.min(cap, Math.floor(event.nativeEvent.layout.height))));
    },
  };
}

function HeartLine({
  device,
  height,
}: {
  readonly device: Device;
  readonly height: number;
}): ReactNode {
  const frame = useRef<View>(null);
  const { live, onLayout } = useVisibleLive(frame);
  const own = useOwnWatch(device);
  const points = useHeartToday(live && own);
  return (
    <View ref={frame} onLayout={onLayout} collapsable={false}>
      {points === undefined || points.length < 2 ? (
        <EmptyGraph text="No heart data yet today" height={height} />
      ) : (
        <Sparkline points={points} colour="heart" height={height} area />
      )}
    </View>
  );
}

export function HeartGraph({
  device,
  cap,
}: {
  readonly device: Device;
  readonly cap: number;
}): ReactNode {
  const { height, onLayout } = useHeartRoom(cap);
  return (
    <View onLayout={onLayout} className="min-h-0 flex-1 justify-end">
      {height === null ? null : <HeartLine device={device} height={height} />}
    </View>
  );
}

export function StepsGraph({ glance }: { readonly glance: WatchGlance }): ReactNode {
  const steps = glance.steps;
  return (
    <ProgressBar
      progress={steps === null ? 0 : steps.value / glance.stepsGoal}
      colour="stand"
      label="Steps today"
    />
  );
}

export function HeartFigure({
  view,
  stale,
}: {
  readonly view: HeartView;
  readonly stale: boolean;
}): ReactNode {
  const caption = heartCaption(view);
  return (
    <WideFigure
      value={String(view.bpm)}
      unit="bpm"
      stale={stale || !view.fresh}
      {...(caption === null ? {} : { caption })}
    />
  );
}

export function StepsFigure({
  glance,
  stale,
}: {
  readonly glance: WatchGlance;
  readonly stale: boolean;
}): ReactNode {
  return (
    <WideFigure
      value={count(glance.steps?.value ?? 0)}
      unit={`/ ${count(glance.stepsGoal)} steps`}
      stale={stale}
    />
  );
}

export function SyncAction({ control }: { readonly control: SyncControl }): ReactNode {
  return (
    <Button
      label={control.label}
      icon="refresh"
      variant="text"
      loading={control.loading}
      disabled={control.disabled}
      {...(control.reason === null ? {} : { hint: control.reason })}
      onPress={() => {
        background(syncNow(), 'now.sync_failed');
      }}
    />
  );
}

export function SetupAction(): ReactNode {
  return <Button label="Set up watch" icon="watch" variant="tonal" href={href.connect('watch')} />;
}

export function BatteryAndOxygen({
  device,
  battery,
}: {
  readonly device: Device;
  readonly battery: number | null;
}): ReactNode {
  const spo2 = useDayFacts(device).spo2;
  return (
    <View className="flex-row flex-wrap items-center gap-x-3 gap-y-1">
      {battery === null ? null : (
        <LevelPill percent={battery} label={`Battery ${count(battery)} %`} />
      )}
      {spo2 === null ? null : (
        <Text variant="caption" tone="variant" className="tabular">
          {`SpO2 ${count(spo2)} %`}
        </Text>
      )}
    </View>
  );
}

const RING_COLOUR = { steps: 'stand', move: 'move', active: 'exercise' } as const;
const RING_SIZE = 96;

export function GoalRings({
  device,
  glance,
}: {
  readonly device: Device;
  readonly glance: WatchGlance;
}): ReactNode {
  const profile = useActiveProfile();
  const targets = effectiveFitnessGoals(profile?.fitness_goals ?? UNSET_FITNESS_GOALS);
  const goals = goalRingsOf({
    steps: glance.steps?.value ?? null,
    stepsGoal: glance.stepsGoal,
    energy: glance.energy,
    energyGoal: targets.move_kcal,
    minutes: useDayFacts(device).activeMinutes,
    minutesGoal: targets.active_minutes,
  });
  return (
    <View className="flex-row items-center gap-4">
      <Rings
        size={RING_SIZE}
        rings={goals.map((goal) => ({
          progress: goal.value / goal.goal,
          colour: RING_COLOUR[goal.key],
          label: goal.label,
        }))}
      />
      <View className="min-w-0 flex-1 gap-0.5">
        {goals.map((goal) => (
          <Text
            key={goal.key}
            variant="caption"
            tone="variant"
            className="tabular"
            numberOfLines={2}
          >
            {`${goal.label} ${count(goal.value)} / ${count(goal.goal)}${goal.unit === '' ? '' : ` ${goal.unit}`}`}
          </Text>
        ))}
      </View>
    </View>
  );
}
