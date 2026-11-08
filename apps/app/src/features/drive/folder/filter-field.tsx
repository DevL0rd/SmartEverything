import type { ReactNode, RefObject } from 'react';
import { useDeferredValue, useEffect, useEffectEvent, useRef, useState } from 'react';
import type { TextInput } from 'react-native';
import { View } from 'react-native';
import { useIsFocused } from 'expo-router';
import type { DriveItem, SmartRule } from '@smarteverything/domain';
import { Button } from '../../../components/button';
import { EmptyState } from '../../../components/empty-state';
import type { TextRange } from '../../../components/highlighted';
import { ListRow } from '../../../components/list-row';
import { SearchField } from '../../../components/search-field';
import { useFrameBodyWidth } from '../../../components/section-body';
import { Text } from '../../../components/text';
import { notifyFailure } from '../../../components/toast-store';
import { isNative, useIdiom } from '../../../design/platform';
import { openSearch } from '../../../search/open-search';
import { flattenPages, useDriveSearch } from '../../nas/data';
import { WIDE_FROM } from './folder-header';
import { folderKeyFor, isEditable } from './folder-keys';
import {
  asksHub,
  childrenOf,
  countLabelOf,
  filterTotalOf,
  filterWordsOf,
  highlightOf,
  hubQueryOf,
  hubStateOf,
  isFinal,
  mergeMatches,
  narrowItems,
  searchAllLabelOf,
  smartRuleOf,
  statusLineOf,
  typedCharOf,
  type FilterCount,
  type FilterPlace,
  type HubState,
} from './filter-model';

export interface FolderFilterInput {
  readonly place: FilterPlace;
  readonly folder: DriveItem | null;
  readonly loaded: readonly DriveItem[];
  readonly complete: boolean;
  readonly online: boolean;
  readonly saveSmart: ((rule: SmartRule) => void) | null;
}

export interface FolderFilter {
  readonly active: boolean;
  readonly matches: readonly DriveItem[] | null;
  readonly field: ReactNode;
  readonly footer: ReactNode;
  readonly empty: ReactNode;
  readonly highlight: (name: string) => TextRange | null;
  readonly focus: () => void;
}

interface TypeToFilter {
  readonly typed: (char: string) => void;
  readonly escape: () => void;
}

function useTypeToFilter(handlers: TypeToFilter): void {
  const typed = useEffectEvent(handlers.typed);
  const escape = useEffectEvent(handlers.escape);
  const visible = useIsFocused();
  useEffect(() => {
    if (!visible || isNative()) return undefined;
    const listen = (event: KeyboardEvent): void => {
      const editable = isEditable(event.target);
      if (event.key === 'Escape') {
        if (!editable) escape();
        return;
      }
      if (event.defaultPrevented) return;
      const char = typedCharOf(event, folderKeyFor(event, editable) !== null, editable);
      if (char === null) return;
      event.preventDefault();
      typed(char);
    };
    globalThis.addEventListener('keydown', listen);
    return (): void => {
      globalThis.removeEventListener('keydown', listen);
    };
  }, [visible]);
}

function FilterInput({
  text,
  status,
  inputRef,
  onChange,
}: {
  readonly text: string;
  readonly status: string | null;
  readonly inputRef: RefObject<TextInput | null>;
  readonly onChange: (text: string) => void;
}): ReactNode {
  const wide = useFrameBodyWidth() >= WIDE_FROM;
  return (
    <View className={wide ? 'w-70' : 'self-stretch'}>
      <SearchField
        value={text}
        onChange={onChange}
        placeholder="Type to filter this folder"
        icon="filter"
        shortcut="/"
        variant="field"
        active={text !== ''}
        inputRef={inputRef}
        {...(status === null ? {} : { status })}
        onKey={(key) => {
          if (key !== 'Escape') return;
          onChange('');
          inputRef.current?.blur();
        }}
      />
    </View>
  );
}

interface FilterActionsProps {
  readonly text: string;
  readonly hub: HubState;
  readonly line: string | null;
  readonly onMore: () => void;
  readonly onRetry: () => void;
  readonly onSave: (() => void) | null;
}

function HubNote({ hub, line, onMore, onRetry }: FilterActionsProps): ReactNode {
  if (line === null) return null;
  return (
    <View className="min-h-9 flex-row flex-wrap items-center gap-2 px-4">
      <Text variant="footnote" tone="variant" className="min-w-0 shrink">
        {line}
      </Text>
      {hub === 'failed' ? <Button label="Try again" variant="text" onPress={onRetry} /> : null}
      {hub === 'more' ? <Button label="Find more matches" variant="text" onPress={onMore} /> : null}
    </View>
  );
}

function SearchAllRows({ text, onSave }: FilterActionsProps): ReactNode {
  const pointer = useIdiom() === 'pointer';
  const searchAll = (): void => {
    openSearch(text.trim());
  };
  const title = searchAllLabelOf(text);
  if (pointer) {
    return (
      <ListRow
        icon="search"
        title={title}
        onPress={searchAll}
        {...(onSave === null
          ? {}
          : {
              trailing: (
                <Button
                  label="Save as smart folder"
                  icon="star"
                  variant="outlined"
                  onPress={onSave}
                />
              ),
            })}
      />
    );
  }
  return (
    <>
      <ListRow icon="search" title={title} chevron onPress={searchAll} />
      {onSave === null ? null : (
        <ListRow icon="star" title="Save as smart folder" chevron onPress={onSave} />
      )}
    </>
  );
}

function FilterFooter(props: FilterActionsProps): ReactNode {
  return (
    <View className="gap-1 border-t border-outline-variant py-1">
      <HubNote {...props} />
      <SearchAllRows {...props} />
    </View>
  );
}

function FilterEmpty(props: FilterActionsProps): ReactNode {
  return (
    <View className="gap-2">
      <EmptyState
        icon="filter"
        title={`No names here start with “${props.text.trim()}”`}
        body={props.line ?? 'Search all of Drive to look in every folder.'}
      />
      <SearchAllRows {...props} />
    </View>
  );
}

interface HubMatches {
  readonly pages: ReturnType<typeof useDriveSearch>;
  readonly found: readonly DriveItem[];
  readonly hub: HubState;
}

function useHubMatches(
  input: FolderFilterInput,
  words: readonly string[],
  text: string,
): HubMatches {
  const deferred = useDeferredValue(text);
  const asked = asksHub(words, input.complete);
  const pages = useDriveSearch(hubQueryOf(deferred, input.place), asked && input.online);
  const found = childrenOf(
    flattenPages(pages.data, (page) => page.items),
    input.place,
  );
  const hub = hubStateOf({
    asked,
    online: input.online,
    fetching: pages.isFetching || deferred !== text,
    failed: pages.error !== null,
    more: pages.hasNextPage,
  });
  return { pages, found: asked ? found : [], hub };
}

function actionsOf(
  input: FolderFilterInput,
  state: {
    readonly text: string;
    readonly hub: HubState;
    readonly pages: HubMatches['pages'];
    readonly filterCount: FilterCount;
  },
): FilterActionsProps {
  const { saveSmart, place } = input;
  const { text, hub, pages } = state;
  return {
    text,
    hub,
    line: statusLineOf(hub, state.filterCount),
    onMore: (): void => {
      pages.fetchNextPage().catch(notifyFailure('More matches could not be found.'));
    },
    onRetry: (): void => {
      pages.refetch().catch(notifyFailure('The rest of this folder could not be searched.'));
    },
    onSave:
      saveSmart === null
        ? null
        : (): void => {
            saveSmart(smartRuleOf(text, place));
          },
  };
}

export function useFolderFilter(input: FolderFilterInput): FolderFilter {
  const [text, setText] = useState('');
  const inputRef = useRef<TextInput>(null);
  const words = filterWordsOf(text);
  const active = words.length > 0;
  const { pages, found, hub } = useHubMatches(input, words, text);
  const matches = active ? narrowItems(mergeMatches(input.loaded, found), words) : null;
  const filterCount: FilterCount = {
    shown: matches?.length ?? 0,
    total: filterTotalOf(input.folder, input.loaded, input.complete),
    final: isFinal(input.complete, hub),
  };
  const focus = (): void => {
    inputRef.current?.focus();
  };
  useTypeToFilter({
    typed: (char) => {
      setText((current) => current + char);
      focus();
    },
    escape: () => {
      setText('');
    },
  });
  const actions = actionsOf(input, { text, hub, pages, filterCount });
  return {
    active,
    matches,
    field: (
      <FilterInput
        text={text}
        status={active ? countLabelOf(filterCount) : null}
        inputRef={inputRef}
        onChange={setText}
      />
    ),
    footer: active ? <FilterFooter {...actions} /> : null,
    empty: active ? <FilterEmpty {...actions} /> : null,
    highlight: (name) => (active ? highlightOf(name, words) : null),
    focus,
  };
}
