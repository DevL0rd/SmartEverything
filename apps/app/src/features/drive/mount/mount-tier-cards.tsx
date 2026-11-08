import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { DesktopPlatform } from '@smarteverything/domain';
import { Badge } from '../../../components/badge';
import { Card } from '../../../components/card';
import { Icon, type IconName } from '../../../components/icon';
import { Text } from '../../../components/text';
import type { Tone } from '../../../components/tone';
import { basicLimitsOf } from '../placements/placement-status';
import type { MountTier, ThisMount } from './mount-model';

export type TierFeatureKind = 'yes' | 'no' | 'later';

export interface TierFeature {
  readonly label: string;
  readonly kind: TierFeatureKind;
}

export interface TierCardFacts {
  readonly tier: MountTier;
  readonly title: string;
  readonly badge: string;
  readonly inUse: boolean;
  readonly body: string;
  readonly features: readonly TierFeature[];
  readonly note: string | null;
}

const FEATURE_ICON: Readonly<Record<TierFeatureKind, IconName>> = {
  yes: 'check',
  no: 'minus',
  later: 'clock',
};

const FEATURE_TONE: Readonly<Record<TierFeatureKind, Tone>> = {
  yes: 'positive',
  no: 'faint',
  later: 'variant',
};

function basicCard(mount: ThisMount): TierCardFacts {
  return {
    tier: 'basic',
    title: 'Basic',
    badge: mount.tier === 'basic' ? 'In use' : 'Works everywhere',
    inUse: mount.tier === 'basic',
    body: 'Drive opens as a network place (WebDAV) in the file manager. Nothing to install.',
    features: [
      { label: 'Browse, open and copy files', kind: 'yes' },
      { label: 'Save changes back', kind: 'yes' },
      { label: 'Programs that need a real disk', kind: 'no' },
      { label: 'Files kept offline', kind: 'no' },
    ],
    note: mount.limits === null ? null : basicLimitsOf(mount.limits),
  };
}

function plannedFull(): TierCardFacts {
  return {
    tier: 'full',
    title: 'Full drive',
    badge: 'Planned for macOS',
    inUse: false,
    body: 'A real folder on this Mac. Programs open files in place and big files stream.',
    features: [
      { label: 'Every program, search and thumbnails', kind: 'later' },
      { label: 'Streams video without copying', kind: 'later' },
      { label: 'Keep folders offline for trips', kind: 'later' },
    ],
    note: null,
  };
}

function writeFeature(mount: ThisMount): TierFeature {
  return mount.readOnly
    ? { label: 'Editing on the drive arrives with write-back', kind: 'later' }
    : { label: 'Editors, office files and git work in place', kind: 'yes' };
}

function fullCard(mount: ThisMount): TierCardFacts {
  const inUse = mount.tier === 'full';
  return {
    tier: 'full',
    title: 'Full drive',
    badge: inUse ? 'In use' : 'Needs a one-time install',
    inUse,
    body: 'A real folder (FUSE). Programs open files in place and big files stream.',
    features: [
      { label: 'Every program, search and thumbnails', kind: 'yes' },
      { label: 'Streams video without copying', kind: 'yes' },
      { label: 'Keep folders offline', kind: 'yes' },
      writeFeature(mount),
    ],
    note: null,
  };
}

export function tierCardsOf(platform: DesktopPlatform, mount: ThisMount): readonly TierCardFacts[] {
  return [basicCard(mount), platform === 'darwin' ? plannedFull() : fullCard(mount)];
}

function Feature({ feature }: { readonly feature: TierFeature }): ReactNode {
  return (
    <View className="flex-row items-start gap-2">
      <Icon name={FEATURE_ICON[feature.kind]} size={16} tone={FEATURE_TONE[feature.kind]} />
      <Text
        variant="footnote"
        tone={feature.kind === 'yes' ? 'default' : 'variant'}
        className="min-w-0 flex-1"
      >
        {feature.label}
      </Text>
    </View>
  );
}

function TierCard({ facts }: { readonly facts: TierCardFacts }): ReactNode {
  return (
    <View className="min-w-64 flex-1 basis-64">
      <Card
        title={facts.title}
        icon={facts.tier === 'full' ? 'hardDrive' : 'globe'}
        action={<Badge label={facts.badge} tone={facts.inUse ? 'primary' : 'neutral'} />}
        className={facts.inUse ? 'h-full border-primary/60' : 'h-full'}
      >
        <Text variant="footnote" tone="variant">
          {facts.body}
        </Text>
        <View accessibilityRole="list" className="gap-1.5">
          {facts.features.map((feature) => (
            <Feature key={feature.label} feature={feature} />
          ))}
        </View>
        {facts.note === null ? null : (
          <Text variant="footnote" tone="variant">
            {facts.note}
          </Text>
        )}
      </Card>
    </View>
  );
}

export function MountTierCards({
  platform,
  mount,
}: {
  readonly platform: DesktopPlatform;
  readonly mount: ThisMount;
}): ReactNode {
  return (
    <View className="flex-row flex-wrap gap-4">
      {tierCardsOf(platform, mount).map((facts) => (
        <TierCard key={facts.tier} facts={facts} />
      ))}
    </View>
  );
}
