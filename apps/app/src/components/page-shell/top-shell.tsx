import { useState, type ReactNode } from 'react';
import { View, type ViewStyle } from 'react-native';
import Animated, {
  interpolate,
  useAnimatedReaction,
  useAnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { TabsBar } from '../tabs-bar';
import { ASIDE_WIDTH, SEARCH_WIDTH, barLeadOf, barTitleStacks, type ShellColumn } from './layout';
import { ShellSearch, type ShellSearchConfig } from './search-slot';
import { ShellActions, type ShellActionsProps } from './shell-actions';
import { useBackAction } from '../back-navigation';
import { ShellBack, ShellTitle, type BackPress, type ShellTitleProps } from './shell-parts';
import type { ShellTabRow } from './shell-sections';

export const COLLAPSE_AT = 48;

export const SURFACE_AT = 8;

const INLINE_SEARCH_FROM = 720;

const SEARCH_STYLE: ViewStyle = {
  flexGrow: 1,
  flexShrink: 1,
  flexBasis: SEARCH_WIDTH.min,
  minWidth: SEARCH_WIDTH.min,
  maxWidth: SEARCH_WIDTH.max,
};

export interface TitleRowProps {
  readonly title: Omit<ShellTitleProps, 'size'>;
  readonly back: boolean;
  readonly actions: Omit<ShellActionsProps, 'kind'>;
}

export function columnStyle(column: ShellColumn): ViewStyle {
  return { marginLeft: column.left, width: column.width };
}

export function widthStyle(width: number): ViewStyle {
  return { width };
}

export function railOffsetStyle(gutter: number): ViewStyle {
  return { marginLeft: gutter };
}

export function asideStyle(): ViewStyle {
  return widthStyle(ASIDE_WIDTH);
}

export function TopSurface({
  scrollY,
  from,
  to,
}: {
  readonly scrollY: SharedValue<number>;
  readonly from: number;
  readonly to: number;
}): ReactNode {
  const style = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.get(), [from, to], [0, 1], 'clamp'),
  }));
  return (
    <Animated.View
      pointerEvents="none"
      style={style}
      className="absolute inset-0 border-b border-outline-variant bg-chrome"
    />
  );
}

function useTitleShown(large: boolean, scrollY: SharedValue<number>): boolean {
  const [shown, setShown] = useState(!large);
  useAnimatedReaction(
    () => !large || scrollY.get() > COLLAPSE_AT - 16,
    (now, before) => {
      if (now !== before) scheduleOnRN(setShown, now);
    },
    [large],
  );
  return shown;
}

export function AppBar({
  row,
  large,
  scrollY,
  column,
}: {
  readonly row: TitleRowProps;
  readonly large: boolean;
  readonly scrollY: SharedValue<number>;
  readonly column: ShellColumn;
}): ReactNode {
  const back = useBackAction(row.back);
  const stacked = !large && barTitleStacks(column.left, back !== null);
  const shown = useTitleShown(large, scrollY);
  const titleStyle = useAnimatedStyle(() => ({
    opacity: large
      ? interpolate(scrollY.get(), [COLLAPSE_AT - 16, COLLAPSE_AT], [0, 1], 'clamp')
      : 1,
  }));
  return (
    <>
      <View className="h-14 flex-row items-center gap-1 px-1">
        <View style={widthStyle(barLeadOf(column.left, back !== null))} />
        <ShellBack back={back} />
        <Animated.View
          style={titleStyle}
          aria-hidden={!shown}
          pointerEvents={shown ? 'auto' : 'none'}
          className="min-w-0 flex-1 px-1"
        >
          {stacked ? null : (
            <ShellTitle {...row.title} size="bar" {...(large ? {} : { testID: 'shell-title' })} />
          )}
        </Animated.View>
        <ShellActions {...row.actions} kind="touch" />
      </View>
      {stacked ? (
        <View style={columnStyle(column)} className="pb-2">
          <ShellTitle {...row.title} size="large" testID="shell-title" />
        </View>
      ) : null}
    </>
  );
}

export function searchInlineAt(column: ShellColumn): boolean {
  return column.width >= INLINE_SEARCH_FROM;
}

function SearchBox({
  search,
  inline,
}: {
  readonly search: ShellSearchConfig;
  readonly inline: boolean;
}): ReactNode {
  return (
    <View testID="shell-search" style={inline ? SEARCH_STYLE : undefined}>
      <ShellSearch search={search} />
    </View>
  );
}

function DesktopTitle({
  row,
  back,
}: {
  readonly row: TitleRowProps;
  readonly back: BackPress;
}): ReactNode {
  return (
    <View className="min-w-0 flex-1 basis-60">
      <ShellTitle
        {...row.title}
        size="desktop"
        testID="shell-title"
        {...(back === null ? {} : { lead: <ShellBack back={back} pointer /> })}
      />
    </View>
  );
}

export function DesktopTitleRow({
  row,
  search,
  column,
}: {
  readonly row: TitleRowProps;
  readonly search: ShellSearchConfig | undefined;
  readonly column: ShellColumn;
}): ReactNode {
  const inline = searchInlineAt(column);
  const back = useBackAction(row.back);
  return (
    <View style={columnStyle(column)} className="gap-2 pt-2">
      <View className="min-h-12 flex-row flex-wrap items-center gap-x-4 gap-y-2">
        <DesktopTitle row={row} back={back} />
        {search !== undefined && inline ? <SearchBox search={search} inline /> : null}
        <ShellActions {...row.actions} kind="pointer" />
      </View>
      {search !== undefined && !inline ? <SearchBox search={search} inline={false} /> : null}
    </View>
  );
}

export function shellRowsShown(
  search: ShellSearchConfig | undefined,
  tabs: readonly ShellTabRow[],
  toolbar: ReactNode,
): boolean {
  return search !== undefined || tabs.length > 0 || toolbar !== undefined;
}

export function ShellRows({
  search,
  tabs,
  toolbar,
  column,
}: {
  readonly search: ShellSearchConfig | undefined;
  readonly tabs: readonly ShellTabRow[];
  readonly toolbar: ReactNode;
  readonly column: ShellColumn;
}): ReactNode {
  if (!shellRowsShown(search, tabs, toolbar)) return null;
  return (
    <View style={columnStyle(column)} className="gap-2 pb-2">
      {search === undefined ? null : (
        <View testID="shell-search">
          <ShellSearch search={search} />
        </View>
      )}
      {tabs.map((row) => (
        <View key={row.key} testID="shell-tabs">
          <TabsBar items={row.tabs.items} active={row.tabs.active} label={row.tabs.label} />
        </View>
      ))}
      {toolbar === undefined ? null : <View testID="shell-toolbar">{toolbar}</View>}
    </View>
  );
}
