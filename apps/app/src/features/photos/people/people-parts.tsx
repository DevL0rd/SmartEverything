import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { PhotoAiStatus, PhotoGroup } from '@smarteverything/domain';
import { Button } from '../../../components/button';
import { Card } from '../../../components/card';
import { Arc, SegmentBar } from '../../../components/charts';
import { FilterChip } from '../../../components/filter-chip';
import type { IconName } from '../../../components/icon-glyphs';
import { Text } from '../../../components/text';
import { count, percent } from '../../../format/number';
import { sentenceCase } from '../../../format/text';
import { usePeopleActions } from './actions';
import { FaceAvatar } from './face-avatar';
import {
  faceProgressOf,
  groupingProgressOf,
  namingLineOf,
  pairLineOf,
  type Naming,
  type SpeciesChip,
} from './model';

export function FaceRing({
  progress,
  label,
  size,
}: {
  readonly progress: number;
  readonly label: string;
  readonly size: number;
}): ReactNode {
  const frame = { width: size, height: size };
  return (
    <View
      accessible
      accessibilityLabel={label}
      style={frame}
      className="items-center justify-center"
    >
      <View className="absolute inset-0">
        <Arc
          value={progress}
          size={size}
          thickness={Math.max(6, size / 10)}
          colour="viz-1"
          tinted
          ticking={false}
        />
      </View>
      <Text variant="footnote" className="tabular-nums font-sans-medium">
        {percent(progress)}
      </Text>
    </View>
  );
}

export function ScanRing({
  status,
  size,
}: {
  readonly status: PhotoAiStatus;
  readonly size: number;
}): ReactNode {
  const progress = faceProgressOf(status);
  return (
    <FaceRing
      progress={progress}
      label={`Faces found in ${percent(progress)} of photos`}
      size={size}
    />
  );
}

export function GroupingRing({
  status,
  size,
}: {
  readonly status: PhotoAiStatus;
  readonly size: number;
}): ReactNode {
  const progress = groupingProgressOf(status);
  return (
    <FaceRing
      progress={progress}
      label={`${percent(progress)} of faces sorted into people`}
      size={size}
    />
  );
}

function NamingBar({ naming }: { readonly naming: Naming }): ReactNode {
  if (naming.total === 0) return null;
  return (
    <SegmentBar
      segments={[
        { label: 'Named people', value: naming.people, colour: 'viz-1' },
        { label: 'Named pets', value: naming.pets, colour: 'viz-2' },
      ]}
      total={naming.total}
      label="People and pets with a name"
      size="regular"
      legend
      format={count}
    />
  );
}

export function PeopleHeader({
  status,
  naming,
}: {
  readonly status: PhotoAiStatus | undefined;
  readonly naming: Naming;
}): ReactNode {
  const indexing = status !== undefined && status.faceGrouping && status.faces.queued > 0;
  return (
    <Card>
      <View className="flex-row flex-wrap items-center gap-x-5 gap-y-3">
        <View className="min-w-40 flex-1 gap-0.5">
          <Text variant="title-3" className="tabular-nums">
            {namingLineOf(naming)}
          </Text>
          <Text variant="footnote" tone="variant">
            {indexing
              ? `Looking for faces · ${count(status.faces.queued)} photos to go`
              : 'Grouped on your home hub. Names stay private to you.'}
          </Text>
        </View>
        {indexing ? <ScanRing status={status} size={56} /> : null}
      </View>
      <View className="pt-3">
        <NamingBar naming={naming} />
      </View>
    </Card>
  );
}

function MergeButtons({ pair }: { readonly pair: readonly [PhotoGroup, PhotoGroup] }): ReactNode {
  const actions = usePeopleActions();
  return (
    <View className="flex-row items-center justify-end gap-2">
      <Button
        label="Not now"
        variant="text"
        disabled={actions.busy}
        onPress={() => {
          actions.dismissMerge(pair);
        }}
      />
      <Button
        label="Merge"
        variant="tonal"
        disabled={actions.busy}
        onPress={() => {
          actions.merge(pair[0], [pair[1]]);
        }}
      />
    </View>
  );
}

export function MergeCard({
  pair,
}: {
  readonly pair: readonly [PhotoGroup, PhotoGroup];
}): ReactNode {
  const [first, second] = pair;
  const noun = first.kind === 'pet' ? 'pet' : 'person';
  return (
    <Card className="min-w-72 flex-1">
      <View className="flex-row items-start gap-3">
        <View className="flex-row">
          <FaceAvatar itemId={first.coverItemId} box={first.coverBox} kind={first.kind} size={48} />
          <FaceAvatar
            itemId={second.coverItemId}
            box={second.coverBox}
            kind={second.kind}
            size={48}
            className="-ml-3 border-2 border-surface-1"
          />
        </View>
        <View className="min-w-0 flex-1 gap-1">
          <View>
            <Text variant="body-strong">{`Same ${noun}?`}</Text>
            <Text variant="footnote" tone="variant" numberOfLines={2}>
              {pairLineOf(first, second)}
            </Text>
          </View>
          <MergeButtons pair={pair} />
        </View>
      </View>
    </Card>
  );
}

export function SectionTitle({
  title,
  detail,
  note,
}: {
  readonly title: string;
  readonly detail: string;
  readonly note: string | null;
}): ReactNode {
  return (
    <View className="gap-1">
      <View className="flex-row items-baseline gap-2 pb-1">
        <Text variant="title-3">{title}</Text>
        <Text variant="footnote" tone="variant" className="tabular-nums">
          {detail}
        </Text>
      </View>
      {note === null ? null : (
        <Text variant="footnote" tone="variant">
          {note}
        </Text>
      )}
    </View>
  );
}

function speciesIconOf(species: string): IconName {
  if (species === 'cat') return 'cat';
  if (species === 'dog') return 'dogFace';
  return 'dog';
}

export function SpeciesChips({
  chips,
  species,
  onSpecies,
}: {
  readonly chips: readonly SpeciesChip[];
  readonly species: string | null;
  readonly onSpecies: (species: string | null) => void;
}): ReactNode {
  return (
    <View className="flex-row flex-wrap gap-2">
      <FilterChip
        label="Pets"
        value="All pets"
        icon="dog"
        active={species === null}
        singleChoice
        onPress={() => {
          onSpecies(null);
        }}
      />
      {chips.map((chip) => (
        <FilterChip
          key={chip.species}
          label="Pets"
          value={sentenceCase(chip.species)}
          icon={speciesIconOf(chip.species)}
          count={chip.count}
          active={species === chip.species}
          singleChoice
          onPress={() => {
            onSpecies(species === chip.species ? null : chip.species);
          }}
        />
      ))}
    </View>
  );
}
