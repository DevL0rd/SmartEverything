import type { ReactNode } from 'react';
import { useMemo } from 'react';
import { View } from 'react-native';
import { Button } from '../../../components/button';
import { Figure } from '../../../components/figure';
import { Glow } from '../../../components/glow';
import { Icon } from '../../../components/icon';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { useColour } from '../../../design/colour';
import { atLeast, useSizeClass } from '../../../design/size-class';
import { clock } from '../../../format/time';
import { useMinute } from '../../../store/clock';
import {
  DeviceVisual,
  LAUNDRY_GLOW_ROLE,
  startingFacts,
  useDeviceVisualState,
} from '../../device-visuals';
import { Note } from './parts';
import { reportedOf } from './draft';
import { progressOf, type CycleView } from './cycles';
import { stageTexts } from './stage-text';
import { stepSpoken, stripOf, upNextOf, type Strip } from './strip';
import type { Runner } from './use-runner';
import type { Laundry } from './use-laundry';

export function PhaseStrip({
  strip,
  colour,
}: {
  readonly strip: Strip;
  readonly colour: string;
}): ReactNode {
  return (
    <View
      accessibilityRole="list"
      accessibilityLabel="Planned phases"
      className="flex-row flex-wrap items-center justify-center gap-y-1.5"
    >
      {strip.steps.map((step, index) => {
        const done = index < strip.current;
        const now = index === strip.current;
        return (
          <View
            key={step.phase}
            accessible
            accessibilityLabel={stepSpoken(strip, index)}
            className="flex-row items-center"
          >
            {index === 0 ? null : <View className="mx-1.5 h-0.5 w-2.5 rounded-full bg-outline" />}
            <View
              className={cn(
                'size-2.5 rounded-full border-2',
                done
                  ? 'border-on-surface-variant bg-on-surface-variant'
                  : 'border-on-surface-variant',
              )}
              style={now ? { backgroundColor: colour, borderColor: colour } : undefined}
            />
            <Text variant="caption" tone={now ? 'default' : 'variant'} className="ml-1.5">
              {step.label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

export function StageActions({
  laundry,
  runner,
  center = true,
}: {
  readonly laundry: Laundry;
  readonly runner: Runner;
  readonly center?: boolean;
}): ReactNode {
  if (laundry.actions.length === 0) {
    return null;
  }
  const blocked = laundry.actions.find((entry) => entry.disabled && entry.reason !== null);
  return (
    <View className="w-full gap-1.5">
      <View className={cn('flex-row flex-wrap gap-2', center && 'justify-center')}>
        {laundry.actions.map((entry) => (
          <Button
            key={entry.id}
            label={entry.label}
            variant={entry.look}
            size="lg"
            {...(entry.icon === undefined ? {} : { icon: entry.icon })}
            disabled={entry.disabled}
            loading={runner.pending === entry.id}
            onPress={() => {
              runner.run(entry.id);
            }}
          />
        ))}
      </View>
      {blocked === undefined ? null : (
        <Text variant="caption" tone="variant" align={center ? 'center' : 'start'}>
          {blocked.reason ?? ''}
        </Text>
      )}
    </View>
  );
}

export type StageVisual = ReturnType<typeof useDeviceVisualState>;

export function useStageVisual(laundry: Laundry, cycles: CycleView, starting = false): StageVisual {
  const visual = useDeviceVisualState(laundry.device);
  const progress = progressOf(laundry.state.remaining, cycles.plannedMinutes);
  const timed = laundry.state.running || laundry.state.key === 'paused';
  return useMemo(() => {
    if (visual.laundry === undefined) {
      return visual;
    }
    const base = { ...visual.laundry, hosted: true, progress: timed ? progress : null };
    return { ...visual, laundry: starting ? startingFacts(base) : base };
  }, [visual, progress, timed, starting]);
}

function UpNext({
  strip,
  remaining,
}: {
  readonly strip: Strip;
  readonly remaining: number | null;
}): ReactNode {
  const next = upNextOf(strip, remaining, useMinute());
  return next === null ? null : (
    <Text variant="caption" tone="variant" align="center" className="tabular">
      {`Up next · ${next.label} about ${clock(next.atMs)}`}
    </Text>
  );
}

function Clocked({
  laundry,
  cycles,
  estimate,
  starting,
}: {
  readonly laundry: Laundry;
  readonly cycles: CycleView;
  readonly estimate: number | null;
  readonly starting: boolean;
}): ReactNode {
  return (
    <StageFigure
      laundry={laundry}
      cycles={cycles}
      estimate={estimate}
      starting={starting}
      now={useMinute()}
    />
  );
}

function StageFigure({
  laundry,
  cycles,
  estimate,
  starting,
  now,
}: {
  readonly laundry: Laundry;
  readonly cycles: CycleView;
  readonly estimate: number | null;
  readonly starting: boolean;
  readonly now?: number;
}): ReactNode {
  const { state, snapshot } = laundry;
  const texts = stageTexts({
    state,
    shown: reportedOf(snapshot.values),
    estimate,
    last: cycles.cycles[0] ?? null,
    starting,
    ...(now === undefined ? {} : { now }),
  });
  const spokenTime =
    state.remaining === null || starting ? texts.figure : `${String(state.remaining)} minutes left`;
  return (
    <>
      <View accessibilityLiveRegion="polite" className="absolute size-px opacity-0">
        <Text>{texts.spoken}</Text>
      </View>
      <View className="items-center gap-0.5" accessible accessibilityLabel={spokenTime}>
        <Figure
          value={texts.figure}
          {...(texts.unit === null ? {} : { unit: texts.unit })}
          size="l"
          stale={state.offline}
        />
        {texts.callout === null ? null : (
          <Text variant="callout" align="center" className="tabular">
            {texts.callout}
          </Text>
        )}
        {texts.caption === null ? null : (
          <Text variant="footnote" tone="variant" align="center" className="tabular">
            {texts.caption}
          </Text>
        )}
      </View>
    </>
  );
}

function DoorLine({ state }: { readonly state: Laundry['state'] }): ReactNode {
  if (state.offline || state.door === null) {
    return null;
  }
  return (
    <View className="flex-row items-center justify-center gap-1.5">
      <Icon name={state.key === 'open' ? 'doorOpen' : 'door'} size={16} />
      <Text variant="footnote" tone="variant">
        {state.door}
      </Text>
    </View>
  );
}

function StageBody({
  laundry,
  cycles,
  estimate,
  runner,
  colour,
  starting,
}: {
  readonly laundry: Laundry;
  readonly cycles: CycleView;
  readonly estimate: number | null;
  readonly runner: Runner;
  readonly colour: string;
  readonly starting: boolean;
}): ReactNode {
  const { state, snapshot } = laundry;
  const strip = stripOf(snapshot.values, state);
  const reason = state.startable && state.key !== 'off' ? state.readiness : null;
  return (
    <>
      {state.key === 'finished' ? (
        <Clocked laundry={laundry} cycles={cycles} estimate={estimate} starting={starting} />
      ) : (
        <StageFigure laundry={laundry} cycles={cycles} estimate={estimate} starting={starting} />
      )}
      {strip === null ? null : <PhaseStrip strip={strip} colour={colour} />}
      {strip === null || !state.running ? null : (
        <UpNext strip={strip} remaining={state.remaining} />
      )}
      <StageActions laundry={laundry} runner={runner} />
      <DoorLine state={state} />
      {reason === null ? null : <Note text={reason} />}
    </>
  );
}

export function LaundryStage({
  laundry,
  cycles,
  estimate,
  runner,
  starting,
}: {
  readonly laundry: Laundry;
  readonly cycles: CycleView;
  readonly estimate: number | null;
  readonly runner: Runner;
  readonly starting: boolean;
}): ReactNode {
  const { state } = laundry;
  const pending = starting && state.resting;
  const visual = useStageVisual(laundry, cycles, pending);
  const { width } = useSizeClass();
  const wide = atLeast(width, 'medium') && !atLeast(width, 'expanded');
  const role = LAUNDRY_GLOW_ROLE[state.offline ? 'rest' : (visual.laundry?.glow ?? 'rest')];
  const colour = useColour(role);
  return (
    <View
      className={cn(
        'relative items-center gap-3 overflow-hidden rounded-xl border-hairline border-outline-variant bg-surface-1 p-4',
        wide && 'flex-row justify-center gap-6',
      )}
    >
      <Glow colour={role} y="30%" strength={0.16} />
      <View pointerEvents="none">
        <DeviceVisual device={laundry.device} size="hero" state={visual} />
      </View>
      <View className={cn('min-w-0 items-center gap-3', wide && 'flex-1')}>
        <StageBody
          laundry={laundry}
          cycles={cycles}
          estimate={estimate}
          runner={runner}
          colour={colour}
          starting={pending}
        />
      </View>
    </View>
  );
}
