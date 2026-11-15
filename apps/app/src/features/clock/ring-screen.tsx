import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { plannerMathsSeedOf, type PlannerDay } from '@smarteverything/domain';
import { Button } from '../../components/button';
import { EmptyState } from '../../components/empty-state';
import { Glow } from '../../components/glow';
import { Text } from '../../components/text';
import { ChallengeArea } from './ring/challenge-area';
import { challengePlanOf } from './ring/challenge-model';
import { ringsOnThisPhone } from './ring/ring-device';
import { sleepLineOf, soundLineOf } from './ring/ring-lines';
import {
  snoozeLabelOf,
  snoozesLeftOf,
  type RingState,
  type RingSubject,
  type RingSubjectRef,
} from './ring/ring-model';
import { MorningCard, RingHeading, SleepLine, SoundLineRow, TodayList } from './ring/ring-parts';
import { SnoozeMeter } from './ring/snooze-meter';
import { StopSlider } from './ring/stop-slider';
import {
  leaveRing,
  useHoldBack,
  useRingActions,
  useRingDay,
  useRingLive,
  useRingSleep,
  useRingSubject,
  type RingActions,
  type RingDay,
  type RingLive,
  type RingTarget,
} from './ring/use-ring';

const STOP_HINT = 'Stopping here stops it on the watch and desktop too';

const CAPTIONS: Readonly<Record<RingActions['route'], string>> = {
  hub: STOP_HINT,
  phone: 'The hub is offline, so this stops it on this phone only.',
  none: 'The hub is offline, so it can’t be stopped from here.',
};

interface Shown {
  readonly ref: RingSubjectRef;
  readonly target: RingTarget;
  readonly snoozedUntil: string | null;
}

type Live = Extract<RingState, { readonly kind: 'ringing' | 'snoozed' | 'local' }>;

function shownOf(state: Live, live: RingLive): Shown {
  const phone = { phoneKey: live.phoneKey, phone: live.phone };
  if (state.kind === 'local') {
    return {
      ref: { kind: state.local.kind, ref_id: state.local.refId },
      target: { hubRing: null, ...phone },
      snoozedUntil: null,
    };
  }
  return {
    ref: { kind: state.ring.kind, ref_id: state.ring.ref_id },
    target: { hubRing: state.ring, ...phone },
    snoozedUntil: state.kind === 'snoozed' ? state.until : null,
  };
}

function snoozeMinutesOf(subject: RingSubject): number | null {
  if (subject.snooze === null) return null;
  return subject.snooze.kind === 'alarm' ? subject.snooze.minutes : 1;
}

interface ControlsProps {
  readonly shown: Shown;
  readonly subject: RingSubject;
  readonly seed: string;
}

function SnoozeControl({
  shown,
  subject,
  enabled,
  onSnooze,
}: {
  readonly shown: Shown;
  readonly subject: RingSubject;
  readonly enabled: boolean;
  readonly onSnooze: () => void;
}): ReactNode {
  if (shown.snoozedUntil !== null) {
    return <SnoozeMeter until={shown.snoozedUntil} minutes={snoozeMinutesOf(subject)} />;
  }
  if (subject.snooze === null) return null;
  const { hubRing, phone } = shown.target;
  const left = snoozesLeftOf(subject.limit, hubRing?.snoozes ?? 0, phone);
  if (left === 0) {
    return (
      <Text variant="callout" tone="variant" align="center">
        No snoozes left
      </Text>
    );
  }
  return (
    <Button
      variant="tonal"
      size="lg"
      icon="moon"
      label={snoozeLabelOf(subject.snooze, left)}
      disabled={!enabled}
      onPress={onSnooze}
    />
  );
}

function RingControls({ shown, subject, seed }: ControlsProps): ReactNode {
  const actions = useRingActions(shown.target, subject);
  const enabled = actions.route !== 'none' && !actions.busy;
  const plan =
    shown.ref.kind === 'alarm'
      ? challengePlanOf(subject.challenge, ringsOnThisPhone())
      : ({ kind: 'none' } as const);
  const slider = (
    <StopSlider
      label={`Stop ${subject.label}`}
      hint={STOP_HINT}
      enabled={enabled}
      onStop={actions.stop}
    />
  );
  const snooze = (
    <SnoozeControl shown={shown} subject={subject} enabled={enabled} onSnooze={actions.snooze} />
  );
  return (
    <View className="gap-3">
      {plan.kind === 'none' ? (
        <>
          {snooze}
          {slider}
        </>
      ) : (
        <>
          <ChallengeArea
            plan={plan}
            seed={seed}
            enabled={enabled}
            onSolved={actions.stop}
            stop={slider}
          />
          {snooze}
        </>
      )}
      {plan.kind === 'phone' && actions.route !== 'none' ? null : (
        <Text variant="caption" tone="variant" align="center">
          {CAPTIONS[actions.route]}
        </Text>
      )}
    </View>
  );
}

function Morning({
  day,
  sleep,
  brief,
}: {
  readonly day: PlannerDay;
  readonly sleep: string | null;
  readonly brief: boolean;
}): ReactNode {
  if (!brief) return <MorningCard day={day} sleep={sleep} />;
  return sleep === null ? null : <SleepLine sleep={sleep} />;
}

function Ringing({ shown, day }: { readonly shown: Shown; readonly day: RingDay }): ReactNode {
  const subject = useRingSubject(shown.ref);
  const sleep = useRingSleep(day.today, shown.ref.kind === 'alarm');
  const sound = shown.ref.kind === 'alarm' ? soundLineOf(shown.target.phone, subject.sound) : null;
  const seed = plannerMathsSeedOf(shown.ref.kind, shown.ref.ref_id, day.today);
  const sleepLine = sleepLineOf(sleep, day.today);
  const challenged = subject.challenge.kind !== 'none';
  return (
    <ScrollView
      className="flex-1"
      contentContainerClassName={
        challenged
          ? 'grow gap-4 self-center w-full max-w-reading px-gutter pt-safe-offset-6 pb-safe-offset-4'
          : 'grow gap-6 self-center w-full max-w-reading px-gutter pt-safe-offset-12 pb-safe-offset-8'
      }
    >
      <View className="gap-3">
        <RingHeading
          icon={subject.icon}
          label={subject.label}
          today={day.today}
          compact={challenged}
        />
        {sound === null ? null : <SoundLineRow line={sound} />}
      </View>
      {day.day === undefined ? null : (
        <>
          {shown.ref.kind === 'alarm' ? (
            <Morning day={day.day} sleep={sleepLine} brief={challenged} />
          ) : null}
          {challenged ? null : <TodayList day={day.day} colours={day.colours} />}
        </>
      )}
      <View className="flex-1" />
      <RingControls shown={shown} subject={subject} seed={seed} />
    </ScrollView>
  );
}

const QUIET = {
  loading: {
    icon: 'alarmClock',
    title: 'Finding the alarm',
    body: 'Asking the hub what is ringing.',
  },
  stopped: {
    icon: 'bellOff',
    title: 'Already stopped',
    body: 'It stopped ringing on every device.',
  },
  missing: {
    icon: 'alarmClock',
    title: 'Not found',
    body: 'This ring is not on the hub any more.',
  },
  unreachable: {
    icon: 'alarmClock',
    title: 'Can’t reach the hub',
    body: 'The hub is offline, so this ring can’t be looked up. It shows here once the hub is back.',
  },
} as const;

function Quiet({ state }: { readonly state: Exclude<RingState, Live>['kind'] }): ReactNode {
  const copy = QUIET[state];
  return (
    <ScrollView
      className="flex-1 bg-bg"
      contentContainerClassName="grow justify-center self-center w-full max-w-reading px-gutter pt-safe-offset-8 pb-safe-offset-8"
    >
      <EmptyState
        icon={copy.icon}
        title={copy.title}
        body={copy.body}
        action={
          state === 'loading' ? undefined : (
            <Button variant="tonal" icon="alarmClock" label="Open Clock" onPress={leaveRing} />
          )
        }
      />
    </ScrollView>
  );
}

function isLive(state: RingState): state is Live {
  return state.kind === 'ringing' || state.kind === 'snoozed' || state.kind === 'local';
}

export function RingScreen(): ReactNode {
  const { ringId } = useLocalSearchParams<{ ringId: string }>();
  const day = useRingDay();
  const live = useRingLive(ringId, day.day, day.failed);
  const { state } = live;
  useHoldBack(isLive(state));
  if (!isLive(state)) return <Quiet state={state.kind} />;
  return (
    <View className="flex-1 bg-bg">
      <Glow colour="primary" breathing x="50%" y="100%" radius="70%" strength={0.38} />
      <Ringing shown={shownOf(state, live)} day={day} />
    </View>
  );
}
