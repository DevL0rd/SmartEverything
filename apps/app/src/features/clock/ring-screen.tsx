import type { PlannerRingRow } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Button } from '../../components/button';
import { EmptyState } from '../../components/empty-state';
import { Glow } from '../../components/glow';
import { Screen } from '../../components/screen';
import { Text } from '../../components/text';
import { clock } from '../../format/time';
import { snoozeLabelOf, type RingState } from './ring/ring-model';
import { MorningCard, RingHeading, TodayList } from './ring/ring-parts';
import { StopSlider } from './ring/stop-slider';
import {
  leaveRing,
  useRingActions,
  useRingDay,
  useRingState,
  useRingSubject,
  type RingDay,
} from './ring/use-ring';

const STOP_HINT = 'Stopping here stops it on the watch and desktop too';

interface RingingProps {
  readonly ring: PlannerRingRow;
  readonly snoozedUntil: string | null;
  readonly day: RingDay;
}

function RingControls({ ring, snoozedUntil }: Omit<RingingProps, 'day'>): ReactNode {
  const subject = useRingSubject(ring);
  const actions = useRingActions(ring, subject);
  const enabled = !actions.offline && !actions.busy;
  const snooze = snoozedUntil === null ? subject.snooze : null;
  return (
    <View className="gap-3">
      {snoozedUntil === null ? null : (
        <Text variant="callout" tone="variant" align="center">
          {`Snoozed until ${clock(snoozedUntil)}`}
        </Text>
      )}
      {snooze === null ? null : (
        <Button
          variant="tonal"
          size="lg"
          icon="moon"
          label={snoozeLabelOf(snooze)}
          disabled={!enabled}
          onPress={actions.snooze}
        />
      )}
      <StopSlider
        label={`Stop ${subject.label}`}
        hint={STOP_HINT}
        enabled={enabled}
        onStop={actions.stop}
      />
      <Text variant="caption" tone="variant" align="center">
        {actions.offline ? 'The hub is offline, so it can’t be stopped from here.' : STOP_HINT}
      </Text>
    </View>
  );
}

function RingHead({
  ring,
  today,
}: {
  readonly ring: PlannerRingRow;
  readonly today: string;
}): ReactNode {
  const subject = useRingSubject(ring);
  return <RingHeading icon={subject.icon} label={subject.label} today={today} />;
}

function Ringing({ ring, snoozedUntil, day }: RingingProps): ReactNode {
  return (
    <ScrollView
      className="flex-1"
      contentContainerClassName="grow gap-6 self-center w-full max-w-reading px-gutter pt-safe-offset-16 pb-safe-offset-8"
    >
      <RingHead ring={ring} today={day.today} />
      {day.day === undefined ? null : (
        <>
          {ring.kind === 'alarm' ? <MorningCard day={day.day} /> : null}
          <TodayList day={day.day} colours={day.colours} />
        </>
      )}
      <View className="flex-1" />
      <RingControls ring={ring} snoozedUntil={snoozedUntil} />
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

function Quiet({
  state,
}: {
  readonly state: Exclude<RingState['kind'], 'ringing' | 'snoozed'>;
}): ReactNode {
  const copy = QUIET[state];
  return (
    <Screen maxWidth="reading">
      <View className="pt-safe-offset-16">
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
      </View>
    </Screen>
  );
}

export function RingScreen(): ReactNode {
  const { ringId } = useLocalSearchParams<{ ringId: string }>();
  const day = useRingDay();
  const state = useRingState(ringId, day.day, day.failed);
  if (state.kind !== 'ringing' && state.kind !== 'snoozed') return <Quiet state={state.kind} />;
  return (
    <View className="flex-1">
      <Glow colour="primary" breathing x="50%" y="100%" radius="70%" strength={0.38} />
      <Ringing
        ring={state.ring}
        snoozedUntil={state.kind === 'snoozed' ? state.until : null}
        day={day}
      />
    </View>
  );
}
