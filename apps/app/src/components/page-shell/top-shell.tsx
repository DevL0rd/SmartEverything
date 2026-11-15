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
import { SEARCH_WIDTH, barLeadOf, type ShellColumn } from './layout';
import { ShellSearch, type ShellSearchConfig } from './search-slot';
import { ShellActions, type ShellActionsProps } from './shell-actions';
import { useBackAction } from '../back-navigation';
import { ShellBack, ShellTitle, type BackPress, type ShellTitleProps } from './shell-parts';
import type { ShellTabRow } from './shell-sections';

export const COLLAPSE_AT = 48;

export const SURFACE_AT = 8;

const TITLE_MIN = 240;

const ROW_GAP = 16;

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
  readonly controls: ReactNode;
  readonly actions: Omit<ShellActionsProps, 'kind'>;
}

export type ControlsPlace = 'title' | 'search' | 'tabs';

export function touchControlsPlaceOf(
  search: ShellSearchConfig | undefined,
  tabs: readonly ShellTabRow[],
): ControlsPlace {
  if (search !== undefined) return 'search';
  return tabs.length > 0 ? 'tabs' : 'title';
}

function ShellControls({ controls }: { readonly controls: ReactNode }): ReactNode {
  if (controls === undefined || controls === null) return null;
  return (
    <View testID="shell-controls" className="shrink-0 flex-row items-center gap-2">
      {controls}
    </View>
  );
}

export function columnStyle(column: ShellColumn): ViewStyle {
  return { marginLeft: column.left, width: column.width };
}

export function widthStyle(width: number): ViewStyle {
  return { width };
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

export type BarTitle = 'bar' | 'collapsing' | 'none';

function useTitleShown(title: BarTitle, scrollY: SharedValue<number>): boolean {
  const [shown, setShown] = useState(title === 'bar');
  useAnimatedReaction(
    () => title === 'bar' || (title === 'collapsing' && scrollY.get() > COLLAPSE_AT - 16),
    (now, before) => {
      if (now !== before) scheduleOnRN(setShown, now);
    },
    [title],
  );
  return shown;
}

export function AppBar({
  row,
  title,
  scrollY,
  column,
  controls,
}: {
  readonly row: TitleRowProps;
  readonly title: BarTitle;
  readonly scrollY: SharedValue<number>;
  readonly column: ShellColumn;
  readonly controls: boolean;
}): ReactNode {
  const back = useBackAction(row.back);
  const shown = useTitleShown(title, scrollY);
  const titleStyle = useAnimatedStyle(() => {
    if (title === 'bar') return { opacity: 1 };
    if (title === 'none') return { opacity: 0 };
    return {
      opacity: interpolate(scrollY.get(), [COLLAPSE_AT - 16, COLLAPSE_AT], [0, 1], 'clamp'),
    };
  });
  return (
    <View className="h-14 flex-row items-center gap-1 px-1">
      <View style={widthStyle(barLeadOf(column.left, back !== null))} />
      <ShellBack back={back} />
      <Animated.View
        style={titleStyle}
        aria-hidden={!shown}
        pointerEvents={shown ? 'auto' : 'none'}
        className="min-w-0 flex-1 px-1"
      >
        <ShellTitle
          {...row.title}
          size="bar"
          {...(title === 'bar' ? { testID: 'shell-title' } : { subtitle: undefined })}
        />
      </Animated.View>
      {controls ? <ShellControls controls={row.controls} /> : null}
      <ShellActions {...row.actions} kind="touch" />
    </View>
  );
}

export function searchInlineAt(column: ShellColumn, trailing: number): boolean {
  return column.width >= TITLE_MIN + SEARCH_WIDTH.min + trailing + ROW_GAP * 2;
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
  const [trailing, setTrailing] = useState(0);
  const inline = searchInlineAt(column, trailing);
  const back = useBackAction(row.back);
  return (
    <View style={columnStyle(column)} className="gap-2 pt-2">
      <View className="min-h-12 flex-row flex-wrap items-center gap-x-4 gap-y-2">
        <DesktopTitle row={row} back={back} />
        {search !== undefined && inline ? <SearchBox search={search} inline /> : null}
        <View
          className="shrink-0 flex-row items-center gap-4"
          onLayout={(event) => {
            setTrailing(event.nativeEvent.layout.width);
          }}
        >
          <ShellControls controls={row.controls} />
          <ShellActions {...row.actions} kind="pointer" />
        </View>
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

function BesideControls({
  controls,
  children,
}: {
  readonly controls: ReactNode;
  readonly children: ReactNode;
}): ReactNode {
  if (controls === undefined || controls === null) return children;
  return (
    <View className="flex-row items-center gap-2">
      <View className="min-w-0 flex-1">{children}</View>
      <ShellControls controls={controls} />
    </View>
  );
}

export function ShellRows({
  search,
  tabs,
  toolbar,
  controls,
  column,
}: {
  readonly search: ShellSearchConfig | undefined;
  readonly tabs: readonly ShellTabRow[];
  readonly toolbar: ReactNode;
  readonly controls: ReactNode;
  readonly column: ShellColumn;
}): ReactNode {
  if (!shellRowsShown(search, tabs, toolbar)) return null;
  const place = touchControlsPlaceOf(search, tabs);
  const last = tabs.at(-1)?.key;
  return (
    <View style={columnStyle(column)} className="gap-2 pb-2">
      {search === undefined ? null : (
        <BesideControls controls={place === 'search' ? controls : undefined}>
          <View testID="shell-search">
            <ShellSearch search={search} />
          </View>
        </BesideControls>
      )}
      {tabs.map((row) => (
        <BesideControls
          key={row.key}
          controls={place === 'tabs' && row.key === last ? controls : undefined}
        >
          <View testID="shell-tabs">
            <TabsBar items={row.tabs.items} active={row.tabs.active} label={row.tabs.label} />
          </View>
        </BesideControls>
      ))}
      {toolbar === undefined ? null : <View testID="shell-toolbar">{toolbar}</View>}
    </View>
  );
}
