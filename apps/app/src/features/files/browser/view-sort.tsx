import type { ReactNode } from 'react';
import { View } from 'react-native';
import { ChoiceChip } from '../../../components/choice-chip';
import { OverflowButton, type MenuItem } from '../../../components/menu';
import { Segmented } from '../../../components/segmented';
import type { FileBrowserHandle } from './browser-types';
import { overflowActionsOf, type OverflowAction } from './menu-specs';
import { DEFAULT_SORT, sortOfValue, sortOptionsOf, sortValueOf } from './sort-model';

const VIEW_OPTIONS = [
  { value: 'list', label: 'List', icon: 'list' },
  { value: 'cards', label: 'Cards', icon: 'grid' },
] as const;

const OVERFLOW_LABEL: Readonly<Record<OverflowAction, string>> = {
  showHidden: 'Show hidden items',
  hideHidden: 'Hide hidden items',
  enterPath: 'Go to a path…',
};

function overflowItemsOf<O>(browser: FileBrowserHandle<O>): readonly MenuItem[] {
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

function SortChip<O>({ browser }: { readonly browser: FileBrowserHandle<O> }): ReactNode {
  const fields = browser.abilities.sort;
  if (fields.length < 2) return null;
  return (
    <ChoiceChip
      label="Sort"
      options={sortOptionsOf(fields)}
      value={sortValueOf(browser.sort)}
      all={sortValueOf(DEFAULT_SORT)}
      onChange={(value) => {
        const sort = sortOfValue(value, fields);
        if (sort !== null) browser.dispatch({ kind: 'sort', sort });
      }}
    />
  );
}

export function ViewSort<O>({ browser }: { readonly browser: FileBrowserHandle<O> }): ReactNode {
  const overflow = overflowItemsOf(browser);
  return (
    <View className="flex-row items-center gap-2">
      <SortChip browser={browser} />
      {browser.abilities.grid ? (
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
      {overflow.length === 0 ? null : <OverflowButton items={overflow} label="View options" />}
    </View>
  );
}
