import { useMemo, type ReactElement, type ReactNode } from 'react';
import { View } from 'react-native';
import type { PhotoAiStatus, PhotoPeople } from '@smarteverything/domain';
import { useMeasuredWidth } from '../../../components/use-measured-width';
import { VirtualList, type VirtualSection } from '../../../components/virtual-list';
import { cn } from '../../../design/cn';
import { useSizeClass } from '../../../design/size-class';
import { useThemeSetting } from '../../../design/theme';
import { gutterOf } from '../../../design/tokens';
import { GroupRow } from './group-tile';
import { namingOf } from './model';
import { MergeCard, PeopleHeader, SectionTitle, SpeciesChips } from './people-parts';
import {
  pairKeyOf,
  peopleRowsOf,
  samePeopleRow,
  tileWidthOf,
  type PeopleRow,
  type RowTop,
} from './people-rows';

const TOP: Readonly<Record<RowTop, string>> = {
  section: 'pt-section-gap',
  merge: 'pt-3',
  chips: 'pt-2',
  grid: 'pt-1',
  none: '',
};

interface RowLook {
  readonly size: number;
  readonly tile: number;
  readonly onSpecies: (species: string | null) => void;
}

function PeopleRowView({
  row,
  look,
}: {
  readonly row: PeopleRow;
  readonly look: RowLook;
}): ReactNode {
  switch (row.kind) {
    case 'title':
      return (
        <View className={TOP.section}>
          <SectionTitle title={row.title} detail={row.detail} note={row.note} />
        </View>
      );
    case 'species':
      return (
        <View className={TOP.chips}>
          <SpeciesChips chips={row.chips} species={row.species} onSpecies={look.onSpecies} />
        </View>
      );
    case 'merge':
      return (
        <View className={cn('flex-row gap-3', TOP[row.top])}>
          {row.pairs.map((pair) => (
            <MergeCard key={pairKeyOf(pair)} pair={pair} />
          ))}
        </View>
      );
    case 'tiles':
      return (
        <View className={TOP[row.top]}>
          <GroupRow groups={row.groups} size={look.size} width={look.tile} />
        </View>
      );
  }
}

function useContentWidth(measured: number): number {
  const size = useSizeClass();
  const gutter = gutterOf(size.width, size.idiom, useThemeSetting('density'));
  return measured - 2 * gutter;
}

export interface PeopleListProps {
  readonly people: PhotoPeople;
  readonly status: PhotoAiStatus | undefined;
  readonly live: boolean;
  readonly size: number;
  readonly species: string | null;
  readonly onSpecies: (species: string | null) => void;
}

function rendererOf(look: RowLook): (row: PeopleRow) => ReactElement {
  return function renderPeopleRow(row: PeopleRow): ReactElement {
    return <PeopleRowView row={row} look={look} />;
  };
}

function rowKeyOf(row: PeopleRow): string {
  return row.key;
}

function rowTypeOf(row: PeopleRow): string {
  return row.kind;
}

function PeopleRows({ width, ...props }: PeopleListProps & { readonly width: number }): ReactNode {
  const { people, status, live, size, species, onSpecies } = props;
  const sections = useMemo(
    (): readonly VirtualSection<PeopleRow>[] => [
      { key: 'people', title: null, data: peopleRowsOf(people, { width, size, live, species }) },
    ],
    [people, width, size, live, species],
  );
  const tile = tileWidthOf(width, size);
  const renderItem = useMemo(() => rendererOf({ size, tile, onSpecies }), [size, tile, onSpecies]);
  return (
    <VirtualList
      sections={sections}
      keyOf={rowKeyOf}
      typeOf={rowTypeOf}
      sameItem={samePeopleRow}
      probe="photos-people"
      header={
        <View className="px-gutter">
          <PeopleHeader status={status} naming={namingOf(people.groups)} />
        </View>
      }
      renderItem={renderItem}
    />
  );
}

export function PeopleList(props: PeopleListProps): ReactNode {
  const { width, onLayout } = useMeasuredWidth(Math.round);
  const content = useContentWidth(width);
  return (
    <View className="-mx-gutter min-h-0 flex-1" onLayout={onLayout}>
      {width === 0 ? null : <PeopleRows {...props} width={content} />}
    </View>
  );
}
