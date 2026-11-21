import type { PlannerBedtime, PlannerBedtimeNight } from '@smarteverything/domain';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../../components/button';
import { Card } from '../../../components/card';
import { Icon } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { Segmented } from '../../../components/segmented';
import { Switch } from '../../../components/switch';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { DayDots } from '../../planner';
import { useClockLabel, useInstantClock } from '../../../store/clock-format';
import { BedtimeDial } from './bedtime-dial';
import { dialTimesOf, sleepLengthText, sleepMinutesOf, type DialTimes } from './dial-model';
import { NightSheet, type NightDraft } from './night-sheet';
import { NoNightsPanel, OffPanel } from './tonight-panels';
import {
  FALLBACK_NIGHT,
  addedNight,
  daysTextOf,
  freeDaysOf,
  nextNightOf,
  removedNight,
  tonightLineOf,
  withNightTimes,
  type NextNight,
} from './schedule-model';

export type BedtimeLayout = 'compact' | 'medium' | 'wide';

const STACK_BELOW = 600;

export interface TonightProps {
  readonly bedtime: PlannerBedtime;
  readonly weekStart: number;
  readonly now: number;
  readonly zone: string;
  readonly layout: BedtimeLayout;
  readonly offline: boolean;
  readonly onSave: (edit: (bedtime: PlannerBedtime) => PlannerBedtime) => void;
  readonly onStart: () => void;
}

function Fact({ label, value }: { readonly label: string; readonly value: string }): ReactNode {
  return (
    <View className="gap-0.5">
      <Text variant="caption" tone="variant">
        {label}
      </Text>
      <Text variant="title-3" className="tabular">
        {value}
      </Text>
    </View>
  );
}

function TonightFacts({
  next,
  now,
  zone,
}: {
  readonly next: NextNight | null;
  readonly now: number;
  readonly zone: string;
}): ReactNode {
  const clockLabel = useClockLabel();
  const instant = useInstantClock();
  return (
    <View className="min-w-0 flex-1 gap-4">
      <View className="flex-row items-center gap-2 rounded-md bg-surface-2 px-3 py-2">
        <Icon name="bed" size={18} colour="sleep-core" />
        <Text variant="body-strong" className="flex-1">
          {tonightLineOf(next, now, clockLabel)}
        </Text>
      </View>
      {next === null ? null : (
        <View className="flex-row flex-wrap gap-x-8 gap-y-3">
          <Fact
            label="Wind-down"
            value={next.windDownAt === next.bedAt ? 'Off' : instant(next.windDownAt, zone)}
          />
          <Fact label="Go to bed" value={clockLabel(next.night.bed)} />
          <Fact label="Wake up" value={clockLabel(next.night.wake)} />
        </View>
      )}
    </View>
  );
}

function NightSpan({ night }: { readonly night: PlannerBedtimeNight }): ReactNode {
  const clockLabel = useClockLabel();
  return (
    <View className="min-w-0 flex-row items-baseline gap-3">
      <Text variant="body-strong" numberOfLines={1} className="shrink-0 tabular">
        {`${clockLabel(night.bed)} – ${clockLabel(night.wake)}`}
      </Text>
      <Text variant="footnote" tone="variant" numberOfLines={1} className="shrink-0 tabular">
        {sleepLengthText(sleepMinutesOf(dialTimesOf(night)))}
      </Text>
    </View>
  );
}

function NightRow({
  night,
  weekStart,
  selected,
  disabled,
  compact,
  onPress,
}: {
  readonly night: PlannerBedtimeNight;
  readonly weekStart: number;
  readonly selected: boolean;
  readonly disabled: boolean;
  readonly compact: boolean;
  readonly onPress: () => void;
}): ReactNode {
  const span = <NightSpan night={night} />;
  const clockLabel = useClockLabel();
  const times = `bed ${clockLabel(night.bed)}, wake ${clockLabel(night.wake)}`;
  return (
    <Interactive
      label={`${daysTextOf(night.days, weekStart)}, ${times}. Change`}
      disabled={disabled}
      selected={selected}
      onPress={onPress}
      className={cn(
        'min-h-touch-min gap-x-4 gap-y-1 rounded-md px-3 py-2',
        compact ? 'flex-col' : 'flex-row items-center',
        selected ? 'bg-surface-3' : 'bg-surface-2',
      )}
      layerClassName="rounded-md"
    >
      <View className="flex-row items-center gap-2">
        <DayDots days={night.days} weekStart={weekStart} />
        {compact ? <View className="flex-1" /> : null}
        {compact ? (
          <View className="shrink-0">
            <Icon name="pencil" size={16} />
          </View>
        ) : null}
      </View>
      {compact ? span : <View className="min-w-0 flex-1 items-end">{span}</View>}
      {compact ? null : <Icon name="pencil" size={16} />}
    </Interactive>
  );
}

interface ScheduleState {
  readonly chosen: number;
  readonly setChosen: (index: number) => void;
  readonly draft: NightDraft | null;
  readonly setDraft: (draft: NightDraft | null) => void;
}

function useScheduleState(): ScheduleState {
  const [chosen, setChosen] = useState(0);
  const [draft, setDraft] = useState<NightDraft | null>(null);
  return { chosen, setChosen, draft, setDraft };
}

function ScheduleList({
  card,
  state,
  stacked,
}: {
  readonly card: TonightProps;
  readonly state: ScheduleState;
  readonly stacked: boolean;
}): ReactNode {
  const { bedtime, weekStart, offline } = card;
  const free = freeDaysOf(bedtime.schedule);
  const last = bedtime.schedule.at(-1) ?? FALLBACK_NIGHT;
  return (
    <View className="gap-2">
      {bedtime.schedule.map((night, index) => (
        <NightRow
          key={night.days.join()}
          night={night}
          weekStart={weekStart}
          selected={index === state.chosen && bedtime.schedule.length > 1}
          disabled={offline}
          compact={stacked}
          onPress={() => {
            state.setChosen(index);
            state.setDraft({ index, days: night.days, times: dialTimesOf(night) });
          }}
        />
      ))}
      {free.length === 0 ? null : (
        <View className="flex-row flex-wrap items-center gap-3">
          <Text variant="footnote" tone="variant" className="min-w-0 flex-1">
            {`No bedtime on ${daysTextOf(free, weekStart)}`}
          </Text>
          <Button
            label="Add nights"
            icon="plus"
            variant="tonal"
            disabled={offline}
            onPress={() => {
              state.setDraft({ index: null, days: free, times: dialTimesOf(last) });
            }}
          />
        </View>
      )}
    </View>
  );
}

function saveDraft(card: TonightProps, state: ScheduleState, draft: NightDraft): void {
  card.onSave((bedtime) => {
    if (draft.index === null)
      return { ...bedtime, schedule: addedNight(bedtime.schedule, draft.days, draft.times) };
    const kept = removedNight(bedtime.schedule, draft.index);
    return { ...bedtime, schedule: addedNight(kept, draft.days, draft.times) };
  });
  state.setDraft(null);
}

function NightPicker({
  card,
  state,
}: {
  readonly card: TonightProps;
  readonly state: ScheduleState;
}): ReactNode {
  const { schedule } = card.bedtime;
  if (schedule.length < 2) return null;
  return (
    <Segmented
      label="Night shown on the dial"
      compact
      value={String(Math.min(state.chosen, schedule.length - 1))}
      options={schedule.map((night, index) => ({
        value: String(index),
        label: daysTextOf(night.days, card.weekStart),
      }))}
      onChange={(value) => {
        state.setChosen(Number(value));
      }}
    />
  );
}

function DialArea({
  card,
  state,
}: {
  readonly card: TonightProps;
  readonly state: ScheduleState;
}): ReactNode {
  const index = Math.min(state.chosen, card.bedtime.schedule.length - 1);
  const night = card.bedtime.schedule[index];
  if (night === undefined) return null;
  const commit = (times: DialTimes): void => {
    card.onSave((bedtime) => ({
      ...bedtime,
      schedule: withNightTimes(bedtime.schedule, index, times),
    }));
  };
  return (
    <BedtimeDial
      times={dialTimesOf(night)}
      windDown={card.bedtime.wind_down_minutes}
      size={card.layout === 'compact' ? 248 : 272}
      draggable={card.layout !== 'compact'}
      disabled={card.offline}
      onCommit={commit}
      onEdit={() => {
        state.setDraft({ index, days: night.days, times: dialTimesOf(night) });
      }}
    />
  );
}

function OnBody({
  card,
  state,
}: {
  readonly card: TonightProps;
  readonly state: ScheduleState;
}): ReactNode {
  const [width, setWidth] = useState<number | null>(null);
  const next = nextNightOf(card.bedtime, card.now, card.zone);
  const compact = card.layout === 'compact';
  const stacked = width === null ? compact : width < STACK_BELOW;
  return (
    <View
      className="gap-4"
      onLayout={(event) => {
        setWidth(event.nativeEvent.layout.width);
      }}
    >
      <NightPicker card={card} state={state} />
      {stacked ? (
        <View className="gap-4">
          <View className="items-center">
            <DialArea card={card} state={state} />
          </View>
          <TonightFacts next={next} now={card.now} zone={card.zone} />
        </View>
      ) : (
        <View className="flex-row items-center gap-8">
          <DialArea card={card} state={state} />
          <TonightFacts next={next} now={card.now} zone={card.zone} />
        </View>
      )}
      <ScheduleList card={card} state={state} stacked={stacked} />
      {compact ? null : (
        <Text variant="footnote" tone="variant">
          Drag the moon or the sun on the dial, or pick a row to type the times.
        </Text>
      )}
    </View>
  );
}

function TonightBody({
  card,
  state,
}: {
  readonly card: TonightProps;
  readonly state: ScheduleState;
}): ReactNode {
  const { bedtime } = card;
  if (!bedtime.enabled) return <OffPanel onStart={card.onStart} offline={card.offline} />;
  if (bedtime.schedule.length > 0) return <OnBody card={card} state={state} />;
  return (
    <NoNightsPanel
      offline={card.offline}
      onAdd={() => {
        state.setDraft({
          index: null,
          days: freeDaysOf(bedtime.schedule),
          times: dialTimesOf(FALLBACK_NIGHT),
        });
      }}
    />
  );
}

export function TonightCard(card: TonightProps): ReactNode {
  const state = useScheduleState();
  const { bedtime } = card;
  return (
    <Card
      title="Bedtime"
      icon="moon"
      action={
        <Switch
          label="Bedtime"
          value={bedtime.enabled}
          disabled={card.offline}
          onChange={(enabled) => {
            if (enabled) card.onStart();
            else card.onSave((current) => ({ ...current, enabled: false }));
          }}
        />
      }
    >
      <TonightBody card={card} state={state} />
      <NightSheet
        draft={state.draft}
        weekStart={card.weekStart}
        onChange={state.setDraft}
        onSave={(draft) => {
          saveDraft(card, state, draft);
        }}
        onRemove={(index) => {
          card.onSave((current) => ({
            ...current,
            schedule: removedNight(current.schedule, index),
          }));
          state.setChosen(0);
          state.setDraft(null);
        }}
        onClose={() => {
          state.setDraft(null);
        }}
      />
    </Card>
  );
}
