import type { PlannerCollectionRow } from '@smarteverything/domain';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../../components/button';
import { ChoiceChip } from '../../../components/choice-chip';
import { FilterChip } from '../../../components/filter-chip';
import { ListRow } from '../../../components/list-row';
import { List } from '../../../components/section';
import { Sheet } from '../../../components/sheet';
import { cn } from '../../../design/cn';
import type { PlannerSearchFilter, PlannerSearchWhen } from '../data/search';
import { LIST_DOT } from '../item/composer-tokens';
import {
  KIND_CHOICES,
  WHEN_TEXT,
  calendarChipTextOf,
  choiceOfKinds,
  filtered,
  kindsOfChoice,
  toggledCollection,
  type KindChoice,
} from './search-model';

const KIND_TEXT: Readonly<Record<KindChoice, string>> = {
  all: 'Events and tasks',
  event: 'Events',
  task: 'Tasks',
};

const WHEN_CHOICES: readonly PlannerSearchWhen[] = ['all', 'upcoming', 'past'];

export interface SearchFiltersProps {
  readonly filter: PlannerSearchFilter;
  readonly collections: readonly PlannerCollectionRow[];
  readonly onChange: (filter: PlannerSearchFilter) => void;
}

function Dot({ collection }: { readonly collection: PlannerCollectionRow }): ReactNode {
  return <View className={cn('size-3 rounded-full', LIST_DOT[collection.colour])} />;
}

function CalendarSheet({
  filter,
  collections,
  onChange,
  onClose,
}: SearchFiltersProps & { readonly onClose: () => void }): ReactNode {
  const chosen = filter.collections;
  return (
    <Sheet
      open
      onClose={onClose}
      title="Calendars and lists"
      detents={['half', 'full']}
      footer={
        <View className="flex-row justify-end gap-2">
          <Button
            label="Show all"
            variant="text"
            disabled={chosen === null}
            onPress={() => {
              onChange({ ...filter, collections: null });
            }}
          />
          <Button label="Done" onPress={onClose} />
        </View>
      }
    >
      <List>
        {collections.map((collection) => (
          <ListRow
            key={collection.id}
            title={collection.name}
            subtitle={collection.kind === 'list' ? 'Task list' : 'Calendar'}
            leading={<Dot collection={collection} />}
            role="checkbox"
            checked={chosen?.includes(collection.id) ?? false}
            onPress={() => {
              onChange({ ...filter, collections: toggledCollection(chosen, collection.id) });
            }}
          />
        ))}
      </List>
    </Sheet>
  );
}

function KindAndWhen({
  filter,
  onChange,
}: Pick<SearchFiltersProps, 'filter' | 'onChange'>): ReactNode {
  return (
    <>
      <ChoiceChip
        label="Kind"
        icon="listCheck"
        options={KIND_CHOICES.map((value) => ({ value, label: KIND_TEXT[value] }))}
        value={choiceOfKinds(filter.kinds)}
        all="all"
        onChange={(choice) => {
          onChange({ ...filter, kinds: kindsOfChoice(choice) });
        }}
      />
      <ChoiceChip
        label="When"
        icon="clock"
        options={WHEN_CHOICES.map((value) => ({ value, label: WHEN_TEXT[value] }))}
        value={filter.when}
        all="all"
        onChange={(when) => {
          onChange({ ...filter, when });
        }}
      />
    </>
  );
}

export function SearchFilters(props: SearchFiltersProps): ReactNode {
  const { filter, collections, onChange } = props;
  const [picking, setPicking] = useState(false);
  return (
    <View className="flex-row flex-wrap items-center gap-2">
      <FilterChip
        label="Calendar"
        value={calendarChipTextOf(filter.collections, collections)}
        icon="calendar"
        affordance="menu"
        active={filter.collections !== null}
        expanded={picking}
        onPress={() => {
          setPicking(true);
        }}
      />
      <KindAndWhen filter={filter} onChange={onChange} />
      {filtered(filter) ? (
        <Button
          label="Clear filters"
          variant="text"
          onPress={() => {
            onChange({ ...filter, collections: null, kinds: null, when: 'all' });
          }}
        />
      ) : null}
      {picking ? (
        <CalendarSheet
          {...props}
          onClose={() => {
            setPicking(false);
          }}
        />
      ) : null}
    </View>
  );
}
