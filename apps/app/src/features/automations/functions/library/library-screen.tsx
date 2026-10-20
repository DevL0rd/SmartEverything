import type { AutomationFunctionSummary } from '@smarteverything/domain';
import { useMemo, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../../../components/button';
import { ChoiceChip } from '../../../../components/choice-chip';
import { EmptyState } from '../../../../components/empty-state';
import { PrimaryAction, usePrimaryActionPlacement } from '../../../../components/primary-action';
import { SearchField } from '../../../../components/search-field';
import { List } from '../../../../components/section';
import { Text } from '../../../../components/text';
import { LibraryRowView } from './library-row';
import {
  EMPTY_FILTER,
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
  readonly onOpen: (functionId: string) => void;
  readonly onCreate: () => void;
}

const ALL = '__all__';

function Heading({ onCreate }: { readonly onCreate: () => void }): ReactNode {
  const placement = usePrimaryActionPlacement();
  return (
    <View className="flex-row items-center justify-between gap-3">
      <View className="min-w-0 flex-1 gap-0.5">
        <Text variant="title-2">Custom Nodes</Text>
        <Text variant="callout" tone="variant">
          Steps and values you make once and use in many automations.
        </Text>
      </View>
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
  return (
    <View className="gap-2">
      <SearchField
        value={filter.query}
        placeholder="Search Custom Nodes"
        onChange={(query) => {
          onChange({ ...filter, query });
        }}
      />
      {categories.length === 0 ? null : (
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
      )}
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

export function LibraryScreen({
  functions,
  userId,
  needsMapping,
  onOpen,
  onCreate,
}: LibraryScreenProps): ReactNode {
  const [filter, setFilter] = useState<LibraryFilter>(EMPTY_FILTER);
  const rows = useMemo(
    () => libraryRows(functions, { userId, needsMapping }),
    [functions, userId, needsMapping],
  );
  const sections = useMemo(() => librarySections(rows, filter), [rows, filter]);
  const empty = libraryEmpty(rows, sections, filter);
  const placement = usePrimaryActionPlacement();
  return (
    <View className="relative gap-section-gap">
      <Heading onCreate={onCreate} />
      <Filters filter={filter} categories={categoriesOf(rows)} onChange={setFilter} />
      {empty === 'none-yet' || empty === 'no-match' ? (
        <Empty kind={empty} onCreate={onCreate} />
      ) : null}
      {empty === 'no-own' ? <NoOwn onCreate={onCreate} /> : null}
      {sections.map((section) => (
        <Rows key={section.id} rows={section.rows} title={section.title} onOpen={onOpen} />
      ))}
      {placement === 'fab' ? (
        <PrimaryAction label="New node" icon="plus" onPress={onCreate} />
      ) : null}
    </View>
  );
}
