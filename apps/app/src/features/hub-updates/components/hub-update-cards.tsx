import type { ReactNode } from 'react';
import { hubUpdateFinished } from '@smarteverything/domain';
import { View } from 'react-native';
import { Section } from '../../../components/section';
import { useIsOwner } from '../../../store/selectors';
import {
  useHubUpdateStarting,
  useHubUpdateStatus,
  type useHubUpdateSource,
} from '../data/update-queries';
import { RecoveryCard } from './recovery-card';
import { SourceCard } from './source-card';

interface HubUpdateCardsProps {
  readonly source: ReturnType<typeof useHubUpdateSource>;
}

export function HubUpdateCards({ source }: HubUpdateCardsProps): ReactNode {
  return useIsOwner() ? <OwnerHubUpdateCards source={source} /> : null;
}

function OwnerHubUpdateCards({ source }: HubUpdateCardsProps): ReactNode {
  const status = useHubUpdateStatus();
  const starting = useHubUpdateStarting();
  const release = status.data?.release ?? null;
  return (
    <Section title="Hub">
      <View className="gap-3">
        <SourceCard
          check={source}
          releaseInProgress={starting || (release !== null && !hubUpdateFinished(release))}
        />
        <RecoveryCard status={status} />
      </View>
    </Section>
  );
}
