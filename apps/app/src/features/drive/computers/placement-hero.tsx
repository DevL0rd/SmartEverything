import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { DrivePlacement, DrivePlacementState } from '@smarteverything/domain';
import { Card } from '../../../components/card';
import { Arc } from '../../../components/charts';
import { Icon, type IconName } from '../../../components/icon';
import { MetricStrip, type MetricItem } from '../../../components/metric-strip';
import { Text } from '../../../components/text';
import type { Tone } from '../../../components/tone';
import { bytes, count, percent } from '../../../format/number';
import { sentenceCase } from '../../../format/text';
import { moment } from '../../../format/time';
import { useMinute } from '../../../store/clock';
import { PlacementLocation, type PlacedFolder } from './placement-row';
import { sentenceOf, syncedShareOf, type PlacementWords } from './placement-words';

const RING_SIZE = 96;
const TILE_COLUMNS = { compact: 2, medium: 4, expanded: 4 } as const;

export type RingCentre =
  | { readonly kind: 'share'; readonly share: number }
  | { readonly kind: 'icon'; readonly icon: IconName };

export interface RingLook {
  readonly value: number;
  readonly centre: RingCentre;
}

const STATE_ICON: Readonly<Record<DrivePlacementState, IconName>> = {
  up_to_date: 'check',
  mounted: 'check',
  offline: 'cloudOff',
  starting: 'loader',
  syncing: 'loader',
  stopped: 'pause',
  failed: 'warning',
  blocked: 'warning',
};

function stateIconOf(placement: DrivePlacement): IconName {
  if (placement.hold !== null) return 'warning';
  if (!placement.enabled) return 'pause';
  return STATE_ICON[placement.status.state];
}

export function ringLookOf(placement: DrivePlacement, size: number | null): RingLook {
  const { status } = placement;
  const progressing =
    placement.hold === null &&
    placement.enabled &&
    (status.state === 'syncing' || (status.state === 'failed' && status.needBytes > 0));
  const share = progressing ? syncedShareOf(status.needBytes, size) : null;
  if (share === null) return { value: 0, centre: { kind: 'icon', icon: stateIconOf(placement) } };
  return { value: share, centre: { kind: 'share', share } };
}

export function heroTilesOf(
  placement: DrivePlacement,
  placed: PlacedFolder,
  now: number,
): readonly MetricItem[] {
  const { status } = placement;
  return [
    { key: 'size', label: 'Size', value: placed.bytes === null ? 'Unknown' : bytes(placed.bytes) },
    ...(status.needBytes === 0
      ? []
      : [{ key: 'waiting', label: 'Left to sync', value: bytes(status.needBytes) }]),
    {
      key: 'synced',
      label: 'Last synced',
      value:
        status.lastSyncedAt === null ? 'Not yet' : sentenceCase(moment(status.lastSyncedAt, now)),
    },
    ...(status.errors.length === 0
      ? []
      : [
          {
            key: 'errors',
            label: 'Problems',
            value: count(status.errors.length),
            tone: 'critical' as const,
          },
        ]),
  ];
}

function toneOf(words: PlacementWords): Tone {
  return words.tone ?? 'variant';
}

function Ring({
  placement,
  placed,
  words,
}: {
  readonly placement: DrivePlacement;
  readonly placed: PlacedFolder;
  readonly words: PlacementWords;
}): ReactNode {
  const look = ringLookOf(placement, placed.bytes);
  const { centre } = look;
  return (
    <View
      accessible
      accessibilityLabel={
        centre.kind === 'share'
          ? `${words.chip.label}, ${percent(centre.share)} synced`
          : words.chip.label
      }
      className="size-24 items-center justify-center"
    >
      <Arc
        value={look.value}
        size={RING_SIZE}
        thickness={10}
        colour={words.tone ?? 'track'}
        overlay
      />
      {centre.kind === 'share' ? (
        <Text variant="title-3" tone={toneOf(words)} className="tabular">
          {percent(centre.share)}
        </Text>
      ) : (
        <Icon name={centre.icon} size={32} tone={toneOf(words)} />
      )}
    </View>
  );
}

export function Hero({
  placement,
  placed,
  words,
}: {
  readonly placement: DrivePlacement;
  readonly placed: PlacedFolder;
  readonly words: PlacementWords;
}): ReactNode {
  const now = useMinute();
  return (
    <Card>
      <View className="flex-row flex-wrap items-center gap-4">
        <Ring placement={placement} placed={placed} words={words} />
        <View className="min-w-48 flex-1 gap-1">
          <Text variant="title-2" numberOfLines={2}>
            {words.chip.label}
          </Text>
          <Text variant="callout" tone="variant" numberOfLines={3}>
            {sentenceOf(placement.mode, words)}
          </Text>
          <PlacementLocation placement={placement} />
        </View>
      </View>
      <MetricStrip items={heroTilesOf(placement, placed, now)} columns={TILE_COLUMNS} />
      {words.notes.map((note) => (
        <Text key={note} variant="footnote" tone="variant">
          {note}
        </Text>
      ))}
    </Card>
  );
}
