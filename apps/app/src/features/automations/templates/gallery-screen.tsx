import type { NodeKindLookup, RefNames } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { Button } from '../../../components/button';
import { EmptyState } from '../../../components/empty-state';
import { Grid } from '../../../components/grid';
import { TabsBar } from '../../../components/tabs-bar';
import { cn } from '../../../design/cn';
import { atLeast, useSizeClass } from '../../../design/size-class';
import {
  CATEGORIES,
  CATEGORY_LABELS,
  type Category,
  type SlotValues,
  type Template,
} from '../model/templates/parameters';
import { previewLines } from '../model/templates/preview';
import type { TakenIdea } from '../model/templates/taken';
import { FillSheet } from './fill-sheet';
import { TemplateCard } from './template-card';

export interface GalleryScreenProps {
  readonly templates: readonly Template[];
  readonly taken: readonly (TakenIdea | null)[];
  readonly names: RefNames;
  readonly kinds: NodeKindLookup;
  readonly onCreate: (entry: Template, values: SlotValues) => void;
  readonly onScratch: () => void;
}

type Filter = Category | 'all';

const CARD_MIN_WIDTH = 340;

function CategoryRail({
  active,
  counts,
  onPick,
}: {
  readonly active: Filter;
  readonly counts: ReadonlyMap<Category, number>;
  readonly onPick: (filter: Filter) => void;
}): ReactNode {
  const shown = CATEGORIES.filter((category) => (counts.get(category) ?? 0) > 0);
  const options: readonly { readonly id: Filter; readonly label: string }[] = [
    { id: 'all', label: 'All' },
    ...shown.map((category) => ({ id: category, label: CATEGORY_LABELS[category] })),
  ];
  return (
    <TabsBar
      compact
      items={options.map((option) => ({
        key: option.id,
        label: option.label,
        onPress: () => {
          onPick(option.id);
        },
      }))}
      active={active}
      label="Template categories"
    />
  );
}

function countsOf(templates: readonly Template[]): ReadonlyMap<Category, number> {
  const counts = new Map<Category, number>();
  for (const entry of templates) counts.set(entry.category, (counts.get(entry.category) ?? 0) + 1);
  return counts;
}

interface Row {
  readonly entry: Template;
  readonly taken: TakenIdea | null;
}

function Cards({
  rows,
  names,
  kinds,
  onUse,
}: {
  readonly rows: readonly Row[];
  readonly names: RefNames;
  readonly kinds: NodeKindLookup;
  readonly onUse: (entry: Template) => void;
}): ReactNode {
  if (rows.length === 0) {
    return (
      <EmptyState
        icon="automations"
        title="No ideas here yet"
        body="Ideas appear as your home gets devices that can use them."
      />
    );
  }
  return (
    <Grid minItemWidth={CARD_MIN_WIDTH} stretchLastRow={false}>
      {rows.map((row) => (
        <TemplateCard
          key={row.entry.id}
          entry={row.entry}
          preview={previewLines(row.entry, names, kinds)}
          taken={row.taken}
          onUse={onUse}
        />
      ))}
    </Grid>
  );
}

export function GalleryScreen({
  templates,
  taken,
  names,
  kinds,
  onCreate,
  onScratch,
}: GalleryScreenProps): ReactNode {
  const wide = atLeast(useSizeClass().width, 'expanded');
  const [filter, setFilter] = useState<Filter>('all');
  const [chosen, setChosen] = useState<Template | null>(null);
  const counts = useMemo(() => countsOf(templates), [templates]);
  const rows = templates.flatMap((entry, index) =>
    filter === 'all' || entry.category === filter ? [{ entry, taken: taken[index] ?? null }] : [],
  );
  return (
    <View className="gap-section-gap">
      <View
        className={cn('gap-2', wide && 'w-full max-w-reading flex-row-reverse items-center gap-3')}
      >
        <View className="self-end">
          <Button label="Start from scratch" icon="plus" variant="outlined" onPress={onScratch} />
        </View>
        <View className={cn(wide && 'min-w-0 flex-1')}>
          <CategoryRail active={filter} counts={counts} onPick={setFilter} />
        </View>
      </View>
      <Cards rows={rows} names={names} kinds={kinds} onUse={setChosen} />
      <FillSheet
        entry={chosen}
        onClose={() => {
          setChosen(null);
        }}
        onCreate={(entry, values) => {
          setChosen(null);
          onCreate(entry, values);
        }}
      />
    </View>
  );
}
