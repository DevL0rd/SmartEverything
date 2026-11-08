import type { ReactNode } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { EmptyState } from '../../components/empty-state';
import { PageHeader } from '../../components/page-header';
import { Screen } from '../../components/screen';
import { useIncomingPlannerRing } from '../planner/data';

export function RingScreen(): ReactNode {
  const { ringId } = useLocalSearchParams<{ ringId: string }>();
  const ring = useIncomingPlannerRing();
  const ringing = ring?.ringId === ringId;
  return (
    <Screen maxWidth="reading" header={<PageHeader title="Alarm" overflow={[]} />}>
      <EmptyState
        icon="alarmClock"
        title={ringing ? 'Ringing now' : 'Not ringing'}
        body={ringing ? 'Stop and snooze show here.' : 'This alarm has stopped ringing.'}
      />
    </Screen>
  );
}
