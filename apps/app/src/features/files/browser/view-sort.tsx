import { useRef, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { measureAnchor, type Rect } from '../../../components/anchor';
import { ChoiceChip } from '../../../components/choice-chip';
import { IconButton } from '../../../components/icon-button';
import type { MenuItem } from '../../../components/menu';
import { Segmented } from '../../../components/segmented';
import { SelectPicker } from '../../../components/select-picker';
import { useSizeClass } from '../../../design/size-class';
import type { FileBrowserHandle } from './browser-types';
import { kindChipsShown } from './kind-chips';
import { overflowActionsOf, type OverflowAction } from './menu-specs';
import { placesShown } from './places-bar';
import { DEFAULT_SORT, sortLabelOf, sortOfValue, sortOptionsOf, sortValueOf } from './sort-model';

const VIEW_OPTIONS = [
  { value: 'list', label: 'List', icon: 'list' },
  { value: 'cards', label: 'Cards', icon: 'grid' },
] as const;

const OVERFLOW_LABEL: Readonly<Record<OverflowAction, string>> = {
  showHidden: 'Show hidden items',
  hideHidden: 'Hide hidden items',
  enterPath: 'Go to a path…',
};

export function browserMenuOf<O>(browser: FileBrowserHandle<O>): readonly MenuItem[] {
  return overflowActionsOf(browser.abilities, browser.state.showHidden).map((action) => ({
    id: action,
    label: OVERFLOW_LABEL[action],
    icon: action === 'enterPath' ? 'textCursor' : action === 'showHidden' ? 'eye' : 'eyeOff',
    onPress: (): void => {
      if (action === 'enterPath') browser.commands.setPending({ kind: 'enterPath' });
      else browser.dispatch({ kind: 'showHidden', show: action === 'showHidden' });
    },
  }));
}

function pickSort<O>(browser: FileBrowserHandle<O>, value: string): void {
  const sort = sortOfValue(value, browser.abilities.sort);
  if (sort !== null) browser.dispatch({ kind: 'sort', sort });
}

function SortChip<O>({ browser }: { readonly browser: FileBrowserHandle<O> }): ReactNode {
  return (
    <ChoiceChip
      label="Sort"
      options={sortOptionsOf(browser.abilities.sort)}
      value={sortValueOf(browser.sort)}
      all={sortValueOf(DEFAULT_SORT)}
      onChange={(value) => {
        pickSort(browser, value);
      }}
    />
  );
}

function SortButton<O>({ browser }: { readonly browser: FileBrowserHandle<O> }): ReactNode {
  const ref = useRef<View>(null);
  const opener = useRef<View>(null);
  const [anchor, setAnchor] = useState<Rect | null>(null);
  return (
    <View ref={ref} collapsable={false}>
      <IconButton
        ref={opener}
        icon="arrow-up-down"
        label={`Sort: ${sortLabelOf(browser.sort)}`}
        selected={sortValueOf(browser.sort) !== sortValueOf(DEFAULT_SORT)}
        onPress={() => {
          measureAnchor(ref, setAnchor);
        }}
      />
      <SelectPicker
        label="Sort"
        options={sortOptionsOf(browser.abilities.sort)}
        value={sortValueOf(browser.sort)}
        anchor={anchor}
        opener={opener}
        onClose={() => {
          setAnchor(null);
        }}
        onPick={(value) => {
          pickSort(browser, value);
        }}
      />
    </View>
  );
}

function ViewButton<O>({ browser }: { readonly browser: FileBrowserHandle<O> }): ReactNode {
  const cards = browser.view === 'cards';
  return (
    <IconButton
      icon={cards ? 'list' : 'grid'}
      label={cards ? 'Show as a list' : 'Show as cards'}
      onPress={() => {
        browser.dispatch({ kind: 'view', view: cards ? 'list' : 'cards' });
      }}
    />
  );
}

function controlsOf<O>(browser: FileBrowserHandle<O>): {
  readonly sort: boolean;
  readonly grid: boolean;
} {
  const { abilities, listing } = browser;
  const shown = abilities.list && listing.entries.length > 0;
  return { sort: shown && abilities.sort.length > 1, grid: shown && abilities.grid };
}

export function BrowserViewControls<O>({
  browser,
}: {
  readonly browser: FileBrowserHandle<O>;
}): ReactNode {
  const dense = useSizeClass().header === 'large';
  const { sort, grid } = controlsOf(browser);
  if (!sort && !grid) return null;
  if (dense) {
    return (
      <View className="flex-row items-center">
        {sort ? <SortButton browser={browser} /> : null}
        {grid ? <ViewButton browser={browser} /> : null}
      </View>
    );
  }
  return (
    <View className="flex-row items-center gap-2">
      {sort ? <SortChip browser={browser} /> : null}
      {grid ? (
        <Segmented
          label="View"
          options={VIEW_OPTIONS}
          value={browser.view}
          onChange={(view) => {
            browser.dispatch({ kind: 'view', view });
          }}
          size="control"
        />
      ) : null}
    </View>
  );
}

export function browserChipsShown<O>(browser: FileBrowserHandle<O>): boolean {
  return kindChipsShown(browser) || placesShown(browser);
}

export function useBrowserControlsInShell<O>(browser: FileBrowserHandle<O>): boolean {
  return useSizeClass().header !== 'desktop' || !browserChipsShown(browser);
}

export interface BrowserShellParts {
  readonly overflow: readonly MenuItem[];
  readonly controls: ReactNode;
}

export function useBrowserShellParts<O>(browser: FileBrowserHandle<O>): BrowserShellParts {
  const inShell = useBrowserControlsInShell(browser);
  return {
    overflow: browserMenuOf(browser),
    controls: inShell ? <BrowserViewControls browser={browser} /> : null,
  };
}
