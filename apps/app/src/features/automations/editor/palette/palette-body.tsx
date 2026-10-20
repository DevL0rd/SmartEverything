import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Badge } from '../../../../components/badge';
import { EmptyState } from '../../../../components/empty-state';
import { Icon } from '../../../../components/icon';
import { IconButton } from '../../../../components/icon-button';
import { IconWell } from '../../../../components/icon-well';
import { Interactive } from '../../../../components/interactive';
import { SearchField } from '../../../../components/search-field';
import { Text } from '../../../../components/text';
import { useIdiom } from '../../../../design/platform';
import { categoryColour } from '../../../../design/node-colours';
import { SECTION_ICONS } from './category-icons';
import type { PaletteEntry, PaletteGroup, PaletteSectionId } from './palette-categories';
import { overviewOf } from './palette-overview';
import { PaletteRow, sectionTitle } from './palette-row';
import {
  inOrder,
  rankEntries,
  reasonFor,
  wordsOf,
  type PaletteContext,
  type PaletteUsage,
  type RankedEntry,
} from './palette-search';
import { ReusableSection } from './reusable-section';

export interface PaletteBodyProps {
  readonly entries: readonly PaletteEntry[];
  readonly groups: readonly PaletteGroup[];
  readonly context: PaletteContext;
  readonly usage: PaletteUsage;
  readonly note: string | null;
  readonly onPick: (entry: PaletteEntry) => void;
  readonly onToggleFavourite: (entry: PaletteEntry) => void;
}

interface RowActions {
  readonly favourites: readonly string[];
  readonly onPick: (entry: PaletteEntry) => void;
  readonly onToggleFavourite: (entry: PaletteEntry) => void;
}

function Rows({
  rows,
  actions,
}: {
  readonly rows: readonly RankedEntry[];
  readonly actions: RowActions;
}): ReactNode {
  return (
    <View className="gap-1">
      {rows.map(({ entry, reason }) => (
        <PaletteRow
          key={entry.key}
          entry={entry}
          reason={reason}
          favourite={entry.usageId !== null && actions.favourites.includes(entry.usageId)}
          onPick={actions.onPick}
          onToggleFavourite={actions.onToggleFavourite}
        />
      ))}
    </View>
  );
}

function Titled({
  title,
  children,
}: {
  readonly title: string;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <View className="gap-1">
      <Text variant="footnote" tone="variant" accessibilityRole="header" className="px-1 pt-2">
        {title}
      </Text>
      {children}
    </View>
  );
}

function CategoryRow({
  group,
  onOpen,
}: {
  readonly group: PaletteGroup;
  readonly onOpen: (id: PaletteSectionId) => void;
}): ReactNode {
  return (
    <Interactive
      label={`${group.name}, ${String(group.entries.length)} items`}
      onPress={() => {
        onOpen(group.id);
      }}
      className="min-h-touch-min flex-row items-center gap-3 rounded-sm px-1"
      layerClassName="rounded-sm"
    >
      <IconWell icon={SECTION_ICONS[group.id]} colour={categoryColour(group.name)} />
      <Text variant="body" numberOfLines={1} className="flex-1">
        {group.name}
      </Text>
      <Badge label={String(group.entries.length)} />
      <Icon name="chevronRight" size={20} tone="faint" />
    </Interactive>
  );
}

type Source = Pick<PaletteBodyProps, 'entries' | 'groups' | 'context' | 'usage'>;

function Overview({
  source,
  actions,
  onOpen,
}: {
  readonly source: Source;
  readonly actions: RowActions;
  readonly onOpen: (id: PaletteSectionId) => void;
}): ReactNode {
  const { entries, groups, context, usage } = source;
  const overview = useMemo(
    () => overviewOf(entries, groups, context, usage),
    [entries, groups, context, usage],
  );
  const asRows = (list: readonly PaletteEntry[]): readonly RankedEntry[] =>
    list.map((entry) => ({ entry, reason: reasonFor(entry, context), score: 0 }));
  return (
    <View className="gap-2">
      {overview.suggested.length === 0 ? null : (
        <Titled title="Suggested">
          <Rows rows={asRows(overview.suggested)} actions={actions} />
        </Titled>
      )}
      {overview.favourites.length === 0 ? null : (
        <Titled title="Favourites">
          <Rows rows={asRows(overview.favourites)} actions={actions} />
        </Titled>
      )}
      {overview.recents.length === 0 ? null : (
        <Titled title="Recent">
          <Rows rows={asRows(overview.recents)} actions={actions} />
        </Titled>
      )}
      <Titled title="Categories">
        {overview.groups.map((group) => (
          <CategoryRow key={group.id} group={group} onOpen={onOpen} />
        ))}
      </Titled>
    </View>
  );
}

function DrillIn({
  group,
  context,
  actions,
  onBack,
}: {
  readonly group: PaletteGroup;
  readonly context: PaletteContext;
  readonly actions: RowActions;
  readonly onBack: () => void;
}): ReactNode {
  const rows = inOrder(group.entries, context);
  return (
    <View className="gap-1">
      <View className="flex-row items-center gap-1">
        <IconButton icon="chevronLeft" label="Back to all categories" onPress={onBack} />
        <Text variant="title-3" accessibilityRole="header">
          {sectionTitle(group.id)}
        </Text>
      </View>
      {group.id === 'reusable' ? (
        <ReusableSection rows={rows} {...actions} />
      ) : (
        <Rows rows={rows} actions={actions} />
      )}
    </View>
  );
}

function Content({
  source,
  query,
  section,
  actions,
  onSection,
}: {
  readonly source: Source;
  readonly query: string;
  readonly section: PaletteSectionId | null;
  readonly actions: RowActions;
  readonly onSection: (id: PaletteSectionId | null) => void;
}): ReactNode {
  const { entries, groups, context, usage } = source;
  const searching = wordsOf(query).length > 0;
  const results = useMemo(
    () => (searching ? rankEntries(entries, query, context, usage) : []),
    [searching, entries, query, context, usage],
  );
  const open = groups.find((group) => group.id === section);
  if (searching) {
    return results.length === 0 ? (
      <EmptyState
        compact
        icon="search"
        title="Nothing matches"
        body="Try a different word, or browse the categories."
      />
    ) : (
      <Rows rows={results} actions={actions} />
    );
  }
  if (open === undefined) return <Overview source={source} actions={actions} onOpen={onSection} />;
  return (
    <DrillIn
      group={open}
      context={context}
      actions={actions}
      onBack={() => {
        onSection(null);
      }}
    />
  );
}

export function PaletteBody({
  entries,
  groups,
  context,
  usage,
  note,
  onPick,
  onToggleFavourite,
}: PaletteBodyProps): ReactNode {
  const [query, setQuery] = useState('');
  const [section, setSection] = useState<PaletteSectionId | null>(null);
  const pointer = useIdiom() === 'pointer';
  const actions: RowActions = { favourites: usage.favourites, onPick, onToggleFavourite };
  return (
    <View className="min-h-0 flex-1 gap-2">
      <View className="px-4">
        <SearchField
          value={query}
          onChange={setQuery}
          placeholder="Search steps, values and triggers"
          focusOnMount={pointer}
          variant="field"
        />
      </View>
      {note === null ? null : (
        <Text variant="footnote" tone="warning" className="px-4">
          {note}
        </Text>
      )}
      <ScrollView className="min-h-0 flex-1" contentContainerClassName="px-4 pb-6">
        <Content
          source={{ entries, groups, context, usage }}
          query={query}
          section={section}
          actions={actions}
          onSection={setSection}
        />
      </ScrollView>
    </View>
  );
}
