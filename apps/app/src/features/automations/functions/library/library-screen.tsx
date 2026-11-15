import type { AutomationFunctionSummary } from '@smarteverything/domain';
import { useMemo, type ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../../../components/button';
import { ChoiceChip } from '../../../../components/choice-chip';
import { EmptyState } from '../../../../components/empty-state';
import { usePrimaryActionPlacement } from '../../../../components/primary-action';
import type { ShellSearchConfig } from '../../../../components/page-shell/search-slot';
import { List } from '../../../../components/section';
import { Text } from '../../../../components/text';
import { LibraryRowView } from './library-row';
import {
  categoriesOf,
  libraryEmpty,
  libraryRows,
  librarySections,
  type LibraryFilter,
  type LibraryRow,
} from './library-model';

export interface LibraryScreenProps {
  readonly functions: readonly AutomationFunctionSummary[];
  readonly userId: string | null;
  readonly needsMapping: ReadonlySet<string>;
  readonly filter: LibraryFilter;
  readonly onFilter: (filter: LibraryFilter) => void;
  readonly onOpen: (functionId: string) => void;
  readonly onCreate: () => void;
}

const ALL = '__all__';

function Heading({ onCreate }: { readonly onCreate: () => void }): ReactNode {
  const placement = usePrimaryActionPlacement();
  return (
    <View className="flex-row items-center justify-between gap-3">
      <Text variant="callout" tone="variant" className="min-w-0 flex-1">
        Steps and values you make once and use in many automations.
      </Text>
      {placement === 'header' ? (
        <Button label="New Custom Node" icon="plus" onPress={onCreate} />
      ) : null}
    </View>
  );
}

function Filters({
  filter,
  categories,
  onChange,
}: {
  readonly filter: LibraryFilter;
  readonly categories: readonly string[];
  readonly onChange: (filter: LibraryFilter) => void;
}): ReactNode {
  if (categories.length === 0) return null;
  return (
    <View className="flex-row flex-wrap gap-2">
      <ChoiceChip
        label="Category"
        icon="automations"
        all={ALL}
        value={filter.category ?? ALL}
        options={[
          { value: ALL, label: 'All categories' },
          ...categories.map((name) => ({ value: name, label: name })),
        ]}
        onChange={(value) => {
          onChange({ ...filter, category: value === ALL ? null : value });
        }}
      />
    </View>
  );
}

function Rows({
  rows,
  title,
  onOpen,
}: {
  readonly rows: readonly LibraryRow[];
  readonly title: string;
  readonly onOpen: (id: string) => void;
}): ReactNode {
  return (
    <List title={title}>
      {rows.map((row) => (
        <LibraryRowView key={row.id} row={row} onOpen={onOpen} />
      ))}
    </List>
  );
}

function NoOwn({ onCreate }: { readonly onCreate: () => void }): ReactNode {
  return (
    <EmptyState
      compact
      icon="automations"
      title="You have not made a Custom Node yet"
      body="Select steps in an automation and choose Make Custom Node, or start an empty one."
      action={<Button label="New Custom Node" icon="plus" onPress={onCreate} />}
    />
  );
}

function Empty({
  kind,
  onCreate,
}: {
  readonly kind: 'none-yet' | 'no-match';
  readonly onCreate: () => void;
}): ReactNode {
  return kind === 'no-match' ? (
    <EmptyState
      icon="search"
      title="No Custom Node matches"
      body="Try another word or clear the category."
    />
  ) : (
    <EmptyState
      icon="automations"
      title="No Custom Nodes yet"
      body="A Custom Node is a group of steps with its own inputs and outputs that many automations can use."
      action={<Button label="New Custom Node" icon="plus" onPress={onCreate} />}
    />
  );
}

export function librarySearchOf(
  filter: LibraryFilter,
  onFilter: (filter: LibraryFilter) => void,
): ShellSearchConfig {
  return {
    value: filter.query,
    placeholder: 'Search Custom Nodes',
    onChange: (query): void => {
      onFilter({ ...filter, query });
    },
  };
}

export function LibraryScreen({
  functions,
  userId,
  needsMapping,
  filter,
  onFilter,
  onOpen,
  onCreate,
}: LibraryScreenProps): ReactNode {
  const rows = useMemo(
    () => libraryRows(functions, { userId, needsMapping }),
    [functions, userId, needsMapping],
  );
  const sections = useMemo(() => librarySections(rows, filter), [rows, filter]);
  const empty = libraryEmpty(rows, sections, filter);
  return (
    <View className="gap-section-gap">
      <View className="w-full gap-section-gap">
        <Heading onCreate={onCreate} />
        <Filters filter={filter} categories={categoriesOf(rows)} onChange={onFilter} />
        {empty === 'none-yet' || empty === 'no-match' ? (
          <Empty kind={empty} onCreate={onCreate} />
        ) : null}
        {empty === 'no-own' ? <NoOwn onCreate={onCreate} /> : null}
      </View>
      <View className="flex-row flex-wrap gap-section-gap">
        {sections.map((section) => (
          <View key={section.id} className="min-w-0 grow shrink basis-96">
            <Rows rows={section.rows} title={section.title} onOpen={onOpen} />
          </View>
        ))}
      </View>
    </View>
  );
}
