import type { ReactNode } from 'react';
import { useDeferredValue, useState } from 'react';
import { View } from 'react-native';
import type { PluginOption, PluginRow } from '@smarteverything/domain';
import { Button } from '../../../components/button';
import { EmptyState } from '../../../components/empty-state';
import { ErrorState } from '../../../components/error-state';
import { Icon } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { SearchField } from '../../../components/search-field';
import { Sheet } from '../../../components/sheet';
import { Skeleton } from '../../../components/skeleton';
import { Text } from '../../../components/text';
import { selectionTick } from '../../../platform/haptics';
import { useOptionPages } from '../data/option-queries';
import { OptionVisual } from './option-visual';

export interface OptionPickerProps {
  readonly row: PluginRow;
  readonly source: string;
  readonly title: string;
  readonly noun: string;
  readonly chosen: readonly string[];
  readonly multiple: boolean;
  readonly onPick: (option: PluginOption) => void;
  readonly onClose: () => void;
}

function OptionRow({
  option,
  selected,
  multiple,
  onPick,
}: {
  readonly option: PluginOption;
  readonly selected: boolean;
  readonly multiple: boolean;
  readonly onPick: (option: PluginOption) => void;
}): ReactNode {
  return (
    <Interactive
      role={multiple ? 'checkbox' : 'radio'}
      label={option.label}
      selected={selected}
      onPress={() => {
        selectionTick();
        onPick(option);
      }}
      className="min-h-row-h flex-row items-center gap-3 px-1"
      layerClassName="rounded-sm"
    >
      <OptionVisual option={option} />
      <View className="min-w-0 flex-1">
        <Text variant="body" numberOfLines={1}>
          {option.label}
        </Text>
        {option.detail === null ? null : (
          <Text variant="footnote" tone="variant" numberOfLines={1}>
            {option.detail}
          </Text>
        )}
      </View>
      {selected ? <Icon name="check" size={24} tone="primary" /> : null}
    </Interactive>
  );
}

type ResultsProps = Omit<OptionPickerProps, 'title' | 'onClose'> & { readonly search: string };

function Results({ row, source, noun, chosen, multiple, onPick, search }: ResultsProps): ReactNode {
  const pages = useOptionPages(row, source, search, true);
  if (pages.unavailable !== null) {
    return (
      <EmptyState
        icon="plug"
        title="Can’t list them right now"
        body={pages.unavailable}
        action={<Button label="Try again" variant="text" onPress={pages.retry} />}
      />
    );
  }
  if (pages.error !== null) {
    return <ErrorState error={pages.error} retry={pages.retry} />;
  }
  if (pages.options.length === 0 && pages.loading) {
    return <Skeleton shape="block" className="h-48" />;
  }
  if (pages.options.length === 0) {
    return (
      <Text variant="body" tone="variant" className="px-1 py-6">
        {search === '' ? `No ${noun} found.` : `No ${noun} match “${search}”.`}
      </Text>
    );
  }
  return (
    <View accessibilityRole={multiple ? 'list' : 'radiogroup'}>
      {pages.options.map((option) => (
        <OptionRow
          key={option.id}
          option={option}
          selected={chosen.includes(option.id)}
          multiple={multiple}
          onPick={onPick}
        />
      ))}
      {pages.more === null ? null : (
        <Button label="Show more" variant="text" loading={pages.loading} onPress={pages.more} />
      )}
    </View>
  );
}

export function OptionPickerSheet(props: OptionPickerProps): ReactNode {
  const [query, setQuery] = useState('');
  const search = useDeferredValue(query).trim();
  return (
    <Sheet
      open
      onClose={props.onClose}
      title={props.title}
      detents={['half', 'full']}
      footer={<Button label="Done" onPress={props.onClose} />}
    >
      <View className="gap-3">
        <SearchField value={query} onChange={setQuery} placeholder={`Search ${props.noun}`} />
        <Results
          row={props.row}
          source={props.source}
          noun={props.noun}
          chosen={props.chosen}
          multiple={props.multiple}
          onPick={props.onPick}
          search={search}
        />
      </View>
    </Sheet>
  );
}
