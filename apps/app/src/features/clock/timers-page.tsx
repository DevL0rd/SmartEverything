import type { PlannerRingRow } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../components/button';
import { Card } from '../../components/card';
import { CardGrid } from '../../components/card-grid';
import { EmptyState } from '../../components/empty-state';
import { Figure } from '../../components/figure';
import { FilterChip } from '../../components/filter-chip';
import { IconButton } from '../../components/icon-button';
import { IconWell } from '../../components/icon-well';
import { Text } from '../../components/text';
import { TextField } from '../../components/text-field';
import { notifyFailure } from '../../components/toast-store';
import { useAreaWidth } from '../../design/size-class';
import { playTime } from '../../format/time';
import { useScreenQuery } from '../../queries/use-screen-query';
import { ringsQuery, usePlannerClockWrites, usePlannerTimers } from '../planner/data';
import { ClockFrame } from './frame/clock-frame';
import { useHubOffline } from './frame/hub-status';
import { frameLayoutOf } from './frame/sections';
import {
  STARTING_PRESET,
  TIMER_PRESETS,
  ringWindowOf,
  timerNameOf,
  timerViewsOf,
  timersSubtitleOf,
  type TimerPreset,
  type TimerView,
} from './lap-model';
import { TimerCard, TimerDial, timerEndOf, timerLineOf, useTimerActions } from './timer-card';
import { TimerUseCard } from './timer-use';

const NO_RINGS: readonly PlannerRingRow[] = [];

function useTimerViews(): readonly TimerView[] {
  const timers = usePlannerTimers(null);
  const span = ringWindowOf(timers);
  const rings = useScreenQuery({
    ...ringsQuery(null, span?.from ?? '', span?.to ?? ''),
    enabled: span !== null,
  });
  return timerViewsOf(timers, span === null ? NO_RINGS : (rings.data ?? NO_RINGS));
}

function useStartTimer(): (preset: TimerPreset, label: string | null) => void {
  const writes = usePlannerClockWrites(null);
  return (preset, label) => {
    background(
      writes
        .startTimer({ duration_ms: preset.ms, label: label ?? preset.name })
        .catch(notifyFailure('Couldn’t start the timer')),
      'clock.timer_start_failed',
    );
  };
}

function PresetChips({
  chosen,
  onChoose,
}: {
  readonly chosen: string | null;
  readonly onChoose: (preset: TimerPreset) => void;
}): ReactNode {
  return (
    <View className="flex-row flex-wrap gap-2">
      {TIMER_PRESETS.map((preset) => (
        <FilterChip
          key={preset.key}
          label={preset.label}
          value={preset.label}
          icon="timer"
          active={preset.key === chosen}
          singleChoice
          onPress={() => {
            onChoose(preset);
          }}
        />
      ))}
    </View>
  );
}

function QuickStart(): ReactNode {
  const start = useStartTimer();
  const offline = useHubOffline();
  const [preset, setPreset] = useState<TimerPreset>(STARTING_PRESET);
  const [label, setLabel] = useState('');
  const submit = (): void => {
    start(preset, label.trim() === '' ? null : label.trim());
    setLabel('');
  };
  return (
    <Card>
      <View className="flex-row flex-wrap items-center gap-4">
        <Figure value={playTime(preset.ms / 1000)} size="m" />
        <View className="min-w-48 flex-1">
          <TextField
            label="Timer label"
            showLabel={false}
            value={label}
            onChange={setLabel}
            onSubmit={submit}
            placeholder={preset.name ?? 'Label, for example Pasta'}
          />
        </View>
        <PresetChips chosen={preset.key} onChoose={setPreset} />
        <Button label="Start" icon="play" variant="filled" disabled={offline} onPress={submit} />
      </View>
    </Card>
  );
}

function RingingBanner({ view }: { readonly view: TimerView }): ReactNode {
  const { offline, act } = useTimerActions(view.timer);
  return (
    <Card>
      <View className="flex-row items-center gap-3">
        <IconWell icon="bell" colour="primary" />
        <View className="min-w-0 flex-1">
          <Text variant="label" numberOfLines={1}>
            {`${timerNameOf(view.timer)} is done`}
          </Text>
          <Text variant="caption" tone="variant" numberOfLines={1} className="tabular">
            {timerLineOf(view)}
          </Text>
        </View>
        <Button
          label="Dismiss"
          variant="filled"
          disabled={offline}
          onPress={() => {
            act('cancel');
          }}
        />
      </View>
    </Card>
  );
}

function HeroActions({ view }: { readonly view: TimerView }): ReactNode {
  const { offline, act, addMinute } = useTimerActions(view.timer);
  const running = view.phase === 'running';
  return (
    <View className="flex-row flex-wrap justify-center gap-3">
      <Button
        label="+1 min"
        spoken="Add one minute"
        variant="outlined"
        size="lg"
        disabled={offline}
        onPress={addMinute}
      />
      <Button
        label={running ? 'Pause' : 'Resume'}
        icon={running ? 'pause' : 'play'}
        variant="filled"
        size="lg"
        disabled={offline}
        onPress={() => {
          act(running ? 'pause' : 'resume');
        }}
      />
      <IconButton
        icon="close"
        label="Cancel timer"
        variant="tonal"
        disabled={offline}
        onPress={() => {
          act('cancel');
        }}
      />
    </View>
  );
}

function TimerHero({ view }: { readonly view: TimerView }): ReactNode {
  return (
    <Card>
      <View className="items-center gap-4 py-2">
        <TimerDial
          view={view}
          size="hero"
          caption={`${timerNameOf(view.timer)} · ${timerEndOf(view)}`}
        />
        <HeroActions view={view} />
      </View>
    </Card>
  );
}

function TimerRow({ view }: { readonly view: TimerView }): ReactNode {
  const { offline, act } = useTimerActions(view.timer);
  const running = view.phase === 'running';
  return (
    <Card>
      <View className="flex-row items-center gap-3">
        <TimerDial view={view} size="row" />
        <View className="min-w-0 flex-1">
          <Text variant="label" numberOfLines={1}>
            {timerNameOf(view.timer)}
          </Text>
          <Text variant="caption" tone="variant" numberOfLines={1} className="tabular">
            {timerLineOf(view)}
          </Text>
        </View>
        <IconButton
          icon={running ? 'pause' : 'play'}
          label={running ? 'Pause' : 'Resume'}
          variant="tonal"
          disabled={offline}
          onPress={() => {
            act(running ? 'pause' : 'resume');
          }}
        />
      </View>
    </Card>
  );
}

function PhoneStart(): ReactNode {
  const start = useStartTimer();
  return (
    <View className="gap-2">
      <Text variant="caption" tone="variant">
        Start a timer
      </Text>
      <PresetChips
        chosen={null}
        onChoose={(preset) => {
          start(preset, null);
        }}
      />
    </View>
  );
}

function NoTimers(): ReactNode {
  return (
    <EmptyState
      icon="timer"
      title="No timers running"
      body="Start one here, from quick add or from chat. Timers run on the hub, so every device shows them."
    />
  );
}

function PhoneTimers({ views }: { readonly views: readonly TimerView[] }): ReactNode {
  const ringing = views.filter((view) => view.phase === 'ringing');
  const [hero, ...rest] = views.filter((view) => view.phase !== 'ringing');
  return (
    <View className="gap-3">
      {ringing.map((view) => (
        <RingingBanner key={view.timer.id} view={view} />
      ))}
      {hero === undefined ? null : <TimerHero view={hero} />}
      {rest.map((view) => (
        <TimerRow key={view.timer.id} view={view} />
      ))}
      {views.length === 0 ? <NoTimers /> : null}
      <PhoneStart />
      <TimerUseCard compact />
    </View>
  );
}

function WideTimers({
  views,
  columns,
}: {
  readonly views: readonly TimerView[];
  readonly columns: number;
}): ReactNode {
  return (
    <View className="gap-4">
      <QuickStart />
      {views.length === 0 ? (
        <NoTimers />
      ) : (
        <CardGrid
          items={views}
          columns={columns}
          keyOf={(view) => view.timer.id}
          render={(view) => <TimerCard view={view} />}
        />
      )}
      <TimerUseCard compact={false} />
    </View>
  );
}

export function TimersPage(): ReactNode {
  const views = useTimerViews();
  const layout = frameLayoutOf(useAreaWidth());
  return (
    <ClockFrame section="timers" subtitle={timersSubtitleOf(views)} width="dashboard">
      {layout === 'compact' ? (
        <PhoneTimers views={views} />
      ) : (
        <WideTimers views={views} columns={layout === 'wide' ? 2 : 1} />
      )}
    </ClockFrame>
  );
}
