import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { DriveRoot } from '@smarteverything/domain';
import { ProgressBar, SegmentBar } from '../../../components/charts';
import { twoFrameColumnsAt } from '../../../components/page-shell/layout';
import { useFrameBodyWidth } from '../../../components/page-shell/body-width';
import { Skeleton } from '../../../components/skeleton';
import { Text } from '../../../components/text';
import { useMeasuredWidth } from '../../../components/use-measured-width';
import { useColour } from '../../../design/colour';
import type { ColourRole } from '../../../design/tokens';
import { bytes } from '../../../format/number';
import { useProfiles } from '../../../store/people';
import { useDeviceNames, useIsOwner } from '../../../store/selectors';
import { ProfileAvatar } from '../../profiles';
import { useDrivePlacementRows, useDriveStats, useRootProgress } from '../data';
import { useSyncPillShown } from '../components/drive-header';
import { SyncLine, driveSyncSummaryOf, useOpenConflicts } from '../components/sync-pill';
import {
  myDriveHeroOf,
  phaseLinesOf,
  rootKindsOf,
  sharedDriveHeroOf,
  type DriveHeroModel,
  type DriveUse,
  type HeroGauge,
  type KindLegendEntry,
} from './hero-model';

function Dot({ colour }: { readonly colour: ColourRole }): ReactNode {
  const fill = { backgroundColor: useColour(colour) };
  return <View aria-hidden className="size-2 rounded-full" style={fill} />;
}

function Legend({ entries }: { readonly entries: readonly KindLegendEntry[] }): ReactNode {
  return (
    <View aria-hidden className="flex-row flex-wrap gap-x-3 gap-y-1">
      {entries.map((entry) => (
        <View key={entry.key} className="flex-row items-center gap-1.5">
          <Dot colour={entry.colour} />
          <Text variant="caption" tone="variant">
            {entry.label}
          </Text>
          <Text variant="caption" className="tabular">
            {entry.value}
          </Text>
        </View>
      ))}
    </View>
  );
}

function KindBar({ hero }: { readonly hero: DriveHeroModel }): ReactNode {
  if (hero.segments.length === 0) {
    return <ProgressBar progress={0} colour="primary" label={`${hero.title} by kind`} />;
  }
  return (
    <SegmentBar
      segments={hero.segments}
      total={hero.total}
      label={`${hero.title} by kind`}
      size="regular"
      format={bytes}
    />
  );
}

function KindBody({
  hero,
  known,
}: {
  readonly hero: DriveHeroModel;
  readonly known: boolean;
}): ReactNode {
  if (!known) {
    return (
      <View aria-busy className="gap-2">
        <Skeleton className="h-2" />
        <Skeleton className="h-4 w-3/4" />
      </View>
    );
  }
  return (
    <View className="gap-2">
      <KindBar hero={hero} />
      {hero.segments.length === 0 ? (
        <Text variant="caption" tone="variant">
          Nothing stored yet
        </Text>
      ) : (
        <Legend entries={hero.legend} />
      )}
    </View>
  );
}

function KindMix({
  hero,
  known,
}: {
  readonly hero: DriveHeroModel;
  readonly known: boolean;
}): ReactNode {
  return (
    <View className="gap-2">
      <KindBody hero={hero} known={known} />
      {hero.caption === null ? null : (
        <Text variant="caption" tone="variant" className="tabular">
          {hero.caption}
        </Text>
      )}
    </View>
  );
}

function Gauge({ gauge }: { readonly gauge: HeroGauge }): ReactNode {
  return (
    <View className="gap-2">
      {gauge.share === null ? null : (
        <ProgressBar progress={gauge.share} colour={gauge.colour} label="Space used" thick />
      )}
      <View>
        <Text
          variant="footnote"
          tone={gauge.colour === 'critical' ? 'critical' : 'variant'}
          className="tabular"
          numberOfLines={1}
        >
          {gauge.text}
        </Text>
        {gauge.note === null ? null : (
          <Text variant="caption" tone="variant" numberOfLines={1}>
            {gauge.note}
          </Text>
        )}
      </View>
    </View>
  );
}

function CompactMeter({
  hero,
  known,
}: {
  readonly hero: DriveHeroModel;
  readonly known: boolean;
}): ReactNode {
  if (!known) return <Skeleton className="h-2" />;
  return (
    <View className="flex-row items-center gap-3">
      <View className="min-w-0 flex-1">
        <KindBar hero={hero} />
      </View>
      {hero.gauge === null ? null : (
        <Text
          variant="caption"
          tone={hero.gauge.colour === 'critical' ? 'critical' : 'variant'}
          numberOfLines={1}
          className="tabular shrink-0"
        >
          {hero.gauge.text}
        </Text>
      )}
    </View>
  );
}

function People(): ReactNode {
  const people = useProfiles();
  return (
    <View
      accessible
      accessibilityLabel={`${String(people.length)} people in the home`}
      className="flex-row"
    >
      {people.map((profile, index) => (
        <View key={profile.id} className={index === 0 ? '' : '-ml-2'}>
          <ProfileAvatar profile={profile} />
        </View>
      ))}
    </View>
  );
}

function Heading({
  hero,
  people,
  caption,
}: {
  readonly hero: DriveHeroModel;
  readonly people: boolean;
  readonly caption: boolean;
}): ReactNode {
  return (
    <View className="min-w-0 gap-1">
      <Text variant="title-3" numberOfLines={1}>
        {hero.title}
      </Text>
      <Text variant="footnote" tone="variant" numberOfLines={2} className="tabular">
        {hero.line}
      </Text>
      {!caption || hero.caption === null ? null : (
        <Text variant="caption" tone="variant" numberOfLines={2} className="tabular">
          {hero.caption}
        </Text>
      )}
      {people ? <People /> : null}
    </View>
  );
}

function useDriveSync(rootId: string): ReactNode {
  const placements = useDrivePlacementRows().filter((placement) => placement.rootId === rootId);
  const names = useDeviceNames('label');
  const summary = driveSyncSummaryOf({ placements, names, conflicts: useOpenConflicts() });
  if (useSyncPillShown() || summary === null) return null;
  return <SyncLine summary={summary} />;
}

function Phases({ root }: { readonly root: DriveRoot }): ReactNode {
  const lines = phaseLinesOf(useRootProgress(root.id), root.state);
  return lines.map((line) => (
    <View key={line.phase} className="gap-1.5">
      <Text variant="caption" tone="variant" numberOfLines={1} className="tabular">
        {line.text}
      </Text>
      <ProgressBar progress={line.share} colour="info" label={line.text} />
    </View>
  ));
}

interface HeroProps {
  readonly hero: DriveHeroModel;
  readonly people: boolean;
  readonly known: boolean;
}

function WideHero({ hero, people, known }: HeroProps): ReactNode {
  return (
    <View className="min-h-22 flex-row items-center gap-6">
      <View className="min-w-64 shrink basis-1/3">
        <Heading hero={hero} people={people} caption={false} />
      </View>
      <View className="min-w-0 flex-1">
        <KindMix hero={hero} known={known} />
      </View>
      {hero.gauge === null ? null : (
        <View className="min-w-44 shrink basis-1/4">
          <Gauge gauge={hero.gauge} />
        </View>
      )}
    </View>
  );
}

function CompactHero({ hero, people, known }: HeroProps): ReactNode {
  return (
    <View className="gap-3">
      <Heading hero={hero} people={people} caption />
      <CompactMeter hero={hero} known={known} />
    </View>
  );
}

function HeroCard({
  root,
  ...props
}: HeroProps & {
  readonly root: DriveRoot;
}): ReactNode {
  const { width, onLayout } = useMeasuredWidth(undefined, useFrameBodyWidth());
  const wide = twoFrameColumnsAt(width);
  const sync = useDriveSync(root.id);
  return (
    <View onLayout={onLayout} className="gap-3 px-4 pt-4">
      {wide ? <WideHero {...props} /> : <CompactHero {...props} />}
      {sync}
      <Phases root={root} />
    </View>
  );
}

export function MyDriveHero({
  root,
  use,
}: {
  readonly root: DriveRoot;
  readonly use: DriveUse;
}): ReactNode {
  const stats = useDriveStats().data;
  const kinds = rootKindsOf(stats, root.id);
  return (
    <HeroCard
      root={root}
      hero={myDriveHeroOf(root, kinds, use)}
      people={false}
      known={stats !== undefined}
    />
  );
}

export function SharedDriveHero({ root }: { readonly root: DriveRoot }): ReactNode {
  const stats = useDriveStats().data;
  const kinds = rootKindsOf(stats, root.id);
  const owner = useIsOwner();
  return (
    <HeroCard
      root={root}
      hero={sharedDriveHeroOf(root, kinds, owner)}
      people
      known={stats !== undefined}
    />
  );
}

export function HeroSkeleton(): ReactNode {
  return <Skeleton shape="tile" className="h-30" />;
}
