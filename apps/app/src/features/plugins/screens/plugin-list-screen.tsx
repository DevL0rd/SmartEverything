import type { ReactNode } from 'react';
import { useDeferredValue, useState } from 'react';
import { View } from 'react-native';
import type { PluginListSetting, PluginOption, PluginRow } from '@smarteverything/domain';
import { href } from '../../../app-shell/hrefs';
import { EmptyState } from '../../../components/empty-state';
import { IconButton } from '../../../components/icon-button';
import { ListRow } from '../../../components/list-row';
import { SearchField } from '../../../components/search-field';
import { Text } from '../../../components/text';
import { VirtualList } from '../../../components/virtual-list';
import { plural } from '../../../format/text';
import { SettingsFrame } from '../../../settings/settings-frame';
import { TextEditSheet, type TextEditRequest } from '../../../settings/text-edit-sheet';
import { chosenLabels, useChosenOptions } from '../data/option-queries';
import { savePlugin } from '../data/plugin-actions';
import { useListEdit, type ListEdit } from '../data/use-list-edit';
import { withToggled, without } from '../model/list-edits';
import { OptionPickerSheet } from '../picker/option-picker-sheet';
import { OptionVisual } from '../picker/option-visual';
import { itemsProblem, listItems, typedItems } from '../model/setting-values';
import { MissingPlugin, usePluginParam } from './plugin-screen';

const SEARCH_FROM = 12;

function addRequest(
  row: PluginRow,
  name: string,
  setting: PluginListSetting,
  items: readonly string[],
): TextEditRequest {
  return {
    title: `Add to ${setting.title}`,
    label: setting.title,
    initial: '',
    placeholder: '',
    confirmLabel: 'Add',
    maxLength: setting.item.maxLength * 20,
    helper: 'Separate several with commas or new lines.',
    problemOf: (text) => itemsProblem(setting, items, text),
    save: (text) => savePlugin(row, { settings: { [name]: [...items, ...typedItems(text)] } }),
  };
}

function subtitleOf(
  item: string,
  option: PluginOption | undefined,
): { readonly subtitle: string } | Record<string, never> {
  const text = option === undefined ? item : option.detail;
  return text === null ? {} : { subtitle: text };
}

function ItemRow({
  item,
  known,
  onRemove,
}: {
  readonly item: string;
  readonly known: ReadonlyMap<string, PluginOption> | null;
  readonly onRemove: () => void;
}): ReactNode {
  const option = known?.get(item);
  const title = option?.label ?? item;
  const remove = <IconButton icon="trash" label={`Remove ${title}`} onPress={onRemove} />;
  if (known === null) {
    return <ListRow title={item} trailing={remove} />;
  }
  return (
    <ListRow
      title={title}
      {...subtitleOf(item, option)}
      leading={
        <OptionVisual option={option ?? { id: item, label: item, color: null, image: null }} />
      }
      trailing={remove}
    />
  );
}

function EmptyList({ setting }: { readonly setting: PluginListSetting }): ReactNode {
  return (
    <EmptyState
      icon="list"
      title="Nothing here yet"
      body={setting.description ?? 'Add the first one.'}
    />
  );
}

function PickToAdd({
  row,
  setting,
  list,
  onClose,
}: {
  readonly row: PluginRow;
  readonly setting: PluginListSetting;
  readonly list: ListEdit;
  readonly onClose: () => void;
}): ReactNode {
  if (setting.picker === null) {
    return null;
  }
  return (
    <OptionPickerSheet
      row={row}
      source={setting.picker}
      title={`Add to ${setting.title}`}
      noun={setting.title.toLowerCase()}
      chosen={list.items}
      multiple
      onPick={(option) => {
        list.edit((items) => withToggled(items, option.id));
      }}
      onClose={onClose}
    />
  );
}

function ListHeader({
  setting,
  searchable,
  query,
  onQuery,
}: {
  readonly setting: PluginListSetting;
  readonly searchable: boolean;
  readonly query: string;
  readonly onQuery: (query: string) => void;
}): ReactNode {
  return (
    <View className="gap-2 px-gutter pt-2">
      {searchable ? (
        <SearchField value={query} onChange={onQuery} placeholder="Search the list" />
      ) : null}
      {setting.description === null ? null : (
        <Text variant="footnote" tone="variant">
          {setting.description}
        </Text>
      )}
    </View>
  );
}

function shownItems(
  items: readonly string[],
  known: ReadonlyMap<string, PluginOption>,
  needle: string,
): readonly string[] {
  return needle === ''
    ? items
    : items.filter((item) =>
        `${item} ${known.get(item)?.label ?? ''}`.toLowerCase().includes(needle),
      );
}

function Items({
  row,
  setting,
  list,
}: {
  readonly row: PluginRow;
  readonly setting: PluginListSetting;
  readonly list: ListEdit;
}): ReactNode {
  const { items } = list;
  const known = chosenLabels(useChosenOptions(row, setting.picker ?? '', items));
  const [query, setQuery] = useState('');
  const deferred = useDeferredValue(query).trim().toLowerCase();
  const shown = shownItems(items, known, deferred);
  if (items.length === 0) {
    return <EmptyList setting={setting} />;
  }
  return (
    <VirtualList
      sections={[{ key: 'items', title: plural(shown.length, 'item'), data: shown }]}
      keyOf={(item) => item}
      renderItem={(item) => (
        <ItemRow
          item={item}
          known={setting.picker === null ? null : known}
          onRemove={() => {
            list.edit((current) => without(current, item));
          }}
        />
      )}
      header={
        <ListHeader
          setting={setting}
          searchable={items.length >= SEARCH_FROM}
          query={query}
          onQuery={setQuery}
        />
      }
      empty={
        <Text variant="body" tone="variant" className="px-gutter py-6">
          Nothing matches “{query.trim()}”.
        </Text>
      }
    />
  );
}

function useAdder(
  row: PluginRow,
  name: string,
  setting: PluginListSetting,
  list: ListEdit,
): { readonly add: () => void; readonly sheets: ReactNode } {
  const [request, setRequest] = useState<TextEditRequest | null>(null);
  const [picking, setPicking] = useState(false);
  const add = (): void => {
    if (setting.picker === null) {
      setRequest(addRequest(row, name, setting, list.items));
    } else {
      setPicking(true);
    }
  };
  const sheets = (
    <>
      {picking ? (
        <PickToAdd
          row={row}
          setting={setting}
          list={list}
          onClose={() => {
            setPicking(false);
          }}
        />
      ) : null}
      <TextEditSheet
        request={request}
        onClose={() => {
          setRequest(null);
        }}
      />
    </>
  );
  return { add, sheets };
}

function PluginListPage({
  row,
  name,
  setting,
}: {
  readonly row: PluginRow;
  readonly name: string;
  readonly setting: PluginListSetting;
}): ReactNode {
  const list = useListEdit(
    listItems(row, name, setting),
    (next) => savePlugin(row, { settings: { [name]: next } }),
    `${setting.title} wasn’t saved`,
  );
  const { add, sheets } = useAdder(row, name, setting, list);
  return (
    <SettingsFrame
      page="plugins"
      title={setting.title}
      detail
      scroll={false}
      trail={[{ label: row.manifest.name, href: href.pluginSettings(row.id) }]}
      primaryAction={{ label: 'Add', icon: 'plus', onPress: add }}
    >
      <View className="w-full max-w-reading flex-1 self-center">
        <Items row={row} setting={setting} list={list} />
      </View>
      {sheets}
    </SettingsFrame>
  );
}

export function PluginListScreen({
  pluginId,
  setting,
}: {
  readonly pluginId: string | undefined;
  readonly setting: string | undefined;
}): ReactNode {
  const row = usePluginParam(pluginId);
  const declared =
    row === null || setting === undefined ? undefined : row.manifest.contributes.settings[setting];
  if (row === null || setting === undefined || declared?.type !== 'list') {
    return <MissingPlugin />;
  }
  return <PluginListPage row={row} name={setting} setting={declared} />;
}
