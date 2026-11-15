import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { PhotoAiStatus, PhotoGroup, PhotoPeople } from '@smarteverything/domain';
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
import { GroupGrid } from './group-tile';
import {
  faceProgressOf,
  groupingProgressOf,
  mergeCandidatesOf,
  namingLineOf,
  pairLineOf,
  speciesChipsOf,
  suggestionKey,
  type Naming,
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

function MergeCard({ pair }: { readonly pair: readonly [PhotoGroup, PhotoGroup] }): ReactNode {
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

export function MergeSuggestions({ people }: { readonly people: PhotoPeople }): ReactNode {
  const pairs = mergeCandidatesOf(people.mergeSuggestions, people.groups);
  if (pairs.length === 0) return null;
  return (
    <View className="flex-row flex-wrap gap-3">
      {pairs.map((pair) => {
        const key = suggestionKey({ groupIds: [pair[0].id, pair[1].id], similarity: 0 });
        return <MergeCard key={key} pair={pair} />;
      })}
    </View>
  );
}

function SectionHead({
  title,
  detail,
}: {
  readonly title: string;
  readonly detail: string | null;
}): ReactNode {
  return (
    <View className="flex-row items-baseline gap-2 pb-1">
      <Text variant="title-3">{title}</Text>
      {detail === null ? null : (
        <Text variant="footnote" tone="variant" className="tabular-nums">
          {detail}
        </Text>
      )}
    </View>
  );
}

export function GroupSection({
  title,
  groups,
  size,
  note,
}: {
  readonly title: string;
  readonly groups: readonly PhotoGroup[];
  readonly size: number;
  readonly note?: string;
}): ReactNode {
  if (groups.length === 0) return null;
  return (
    <View className="gap-1">
      <SectionHead title={title} detail={count(groups.length)} />
      {note === undefined ? null : (
        <Text variant="footnote" tone="variant">
          {note}
        </Text>
      )}
      <GroupGrid groups={groups} size={size} />
    </View>
  );
}

function speciesIconOf(species: string): IconName {
  if (species === 'cat') return 'cat';
  if (species === 'dog') return 'dogFace';
  return 'dog';
}

export function PetsSection({
  all,
  pets,
  species,
  size,
  onSpecies,
}: {
  readonly all: readonly PhotoGroup[];
  readonly pets: readonly PhotoGroup[];
  readonly species: string | null;
  readonly size: number;
  readonly onSpecies: (species: string | null) => void;
}): ReactNode {
  const chips = speciesChipsOf(all);
  if (chips.length === 0) return null;
  return (
    <View className="gap-2">
      <SectionHead title="Pets" detail={count(chips.reduce((sum, chip) => sum + chip.count, 0))} />
      {chips.length < 2 ? null : (
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
      )}
      <GroupGrid groups={pets} size={size} />
    </View>
  );
}
