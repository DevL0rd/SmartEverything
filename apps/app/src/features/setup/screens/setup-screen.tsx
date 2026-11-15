import type { ReactNode } from 'react';
import { View } from 'react-native';
import { EmptyState } from '../../../components/empty-state';
import { Section } from '../../../components/section';
import { SettingsFrame } from '../../../settings/settings-frame';
import { SetupHero } from '../components/setup-hero';
import { SetupItemCard } from '../components/setup-item-card';
import { useReadiness } from '../data/use-readiness';
import { AREA_TITLES, SETUP_AREAS } from '../model/items';
import type { Readiness, ReadinessEntry } from '../model/readiness';

function AreaList({
  title,
  entries,
  next,
}: {
  readonly title: string;
  readonly entries: readonly ReadinessEntry[];
  readonly next: ReadinessEntry | null;
}): ReactNode {
  if (entries.length === 0) return null;
  return (
    <Section title={title}>
      <View className="gap-2">
        {entries.map((entry) => (
          <SetupItemCard key={entry.item.id} entry={entry} next={next?.item.id === entry.item.id} />
        ))}
      </View>
    </Section>
  );
}

function Areas({ readiness }: { readonly readiness: Readiness }): ReactNode {
  const active = readiness.entries.filter(
    (entry) => entry.state !== 'skipped' && entry.item.priority !== 'optional',
  );
  const more = readiness.entries.filter(
    (entry) => entry.state !== 'skipped' && entry.item.priority === 'optional',
  );
  const skipped = readiness.entries.filter((entry) => entry.state === 'skipped');
  return (
    <>
      {SETUP_AREAS.map((area) => (
        <AreaList
          key={area}
          title={AREA_TITLES[area]}
          entries={active.filter((entry) => entry.item.area === area)}
          next={readiness.next}
        />
      ))}
      <AreaList title="More you can set up" entries={more} next={null} />
      <AreaList title="Skipped" entries={skipped} next={null} />
    </>
  );
}

export function SetupScreen(): ReactNode {
  const readiness = useReadiness();
  return (
    <SettingsFrame page="setup">
      {readiness.entries.length === 0 ? (
        <EmptyState
          icon="circleCheck"
          title="Nothing to set up"
          body="Everything that is yours to set up is done."
        />
      ) : (
        <>
          <SetupHero readiness={readiness} />
          <Areas readiness={readiness} />
        </>
      )}
    </SettingsFrame>
  );
}
