import type { ReactNode } from 'react';
import { hubUpdateFinished } from '@smarteverything/domain';
import { View } from 'react-native';
import { Section } from '../../../components/section';
import { useIsOwner } from '../../../store/selectors';
import {
  useBuildSources,
  useHubUpdateStarting,
  useHubUpdateStatus,
  type useHubUpdateSource,
} from '../data/update-queries';
import { BuildSourcesCard } from './build-sources-card';
import { PushReleasesCard } from './push-releases-card';
import { RecoveryCard } from './recovery-card';
import { SourceCard } from './source-card';
import { StagedBuildsCard } from './staged-builds-card';

interface HubUpdateCardsProps {
  readonly source: ReturnType<typeof useHubUpdateSource>;
}

export function HubUpdateCards({ source }: HubUpdateCardsProps): ReactNode {
  return useIsOwner() ? <OwnerHubUpdateCards source={source} /> : null;
}

function OwnerHubUpdateCards({ source }: HubUpdateCardsProps): ReactNode {
  const status = useHubUpdateStatus();
  const starting = useHubUpdateStarting();
  const sources = useBuildSources();
  const release = status.data?.release ?? null;
  return (
    <Section title="Hub">
      <View className="gap-3">
        <RecoveryCard status={status} />
        <BuildSourcesCard />
        <StagedBuildsCard />
        <SourceCard
          check={source}
          hubSource={sources.data?.hub}
          releaseInProgress={starting || (release !== null && !hubUpdateFinished(release))}
        />
        <PushReleasesCard />
      </View>
    </Section>
  );
}
