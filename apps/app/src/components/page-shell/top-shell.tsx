import type { ReactNode } from 'react';
import { View, type ViewStyle } from 'react-native';
import Animated, { interpolate, useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import { TabsBar } from '../tabs-bar';
import { BarInline, BarTrailing, OpenSearch, useBarSearch, type BarSearch } from './bar-search';
import { barLeadOf, type ShellColumn } from './layout';
import type { ShellSearchConfig } from './search-slot';
import { ShellActions, ShellOverflow, type ShellActionsProps } from './shell-actions';
import { useBackAction } from '../back-navigation';
import { ShellBack, ShellTitle, type BackPress, type ShellTitleProps } from './shell-parts';
import type { ShellTabs } from './shell-sections';

export const SURFACE_AT = 8;

export interface TitleRowProps {
  readonly title: Omit<ShellTitleProps, 'size'>;
  readonly back: boolean;
  readonly controls: ReactNode;
  readonly actions: Omit<ShellActionsProps, 'kind'>;
}

export type ControlsPlace = 'title' | 'tabs';

export function touchControlsPlaceOf(tabs: ShellTabs | undefined): ControlsPlace {
  return tabs === undefined ? 'title' : 'tabs';
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

export function AppBar({
  row,
  column,
  controls,
  search,
}: {
  readonly row: TitleRowProps;
  readonly column: ShellColumn;
  readonly controls: boolean;
  readonly search: ShellSearchConfig | undefined;
}): ReactNode {
  const back = useBackAction(row.back);
  const bar = useBarSearch(search);
  if (search !== undefined && bar.mode === 'open') {
    return (
      <View
        className="h-14 flex-row items-center gap-1 px-1"
        onLayout={(event) => {
          bar.onBar(event.nativeEvent.layout.width);
        }}
      >
        <OpenSearch search={search} onClose={bar.close} back={back} />
        <ShellOverflow {...row.actions} kind="touch" />
      </View>
    );
  }
  return (
    <View
      className="min-h-14 flex-row items-center gap-1 px-1"
      onLayout={(event) => {
        bar.onBar(event.nativeEvent.layout.width);
      }}
    >
      <View style={widthStyle(barLeadOf(column.left, back !== null))} />
      <ShellBack back={back} />
      <View style={bar.titleStyle} className="min-w-0 flex-1 px-1">
        <ShellTitle {...row.title} size="bar" testID="shell-title" onNeed={bar.onTitle} />
      </View>
      <BarInline search={search} bar={bar} />
      <BarTrailing search={search} bar={bar}>
        {controls ? <ShellControls controls={row.controls} /> : null}
        <ShellActions {...row.actions} kind="touch" />
      </BarTrailing>
    </View>
  );
}

function DesktopTitle({
  row,
  back,
  bar,
}: {
  readonly row: TitleRowProps;
  readonly back: BackPress;
  readonly bar: BarSearch;
}): ReactNode {
  return (
    <View style={bar.titleStyle} className="min-w-0 flex-1">
      <ShellTitle
        {...row.title}
        size="desktop"
        testID="shell-title"
        onNeed={bar.onTitle}
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
  const back = useBackAction(row.back);
  const bar = useBarSearch(search);
  if (search !== undefined && bar.mode === 'open') {
    return (
      <View
        style={columnStyle(column)}
        className="min-h-12 flex-row items-center gap-4 pt-2"
        onLayout={(event) => {
          bar.onBar(event.nativeEvent.layout.width);
        }}
      >
        <OpenSearch search={search} onClose={bar.close} back={back} />
        <ShellOverflow {...row.actions} kind="pointer" />
      </View>
    );
  }
  return (
    <View
      style={columnStyle(column)}
      className="min-h-12 flex-row items-center gap-4 pt-2"
      onLayout={(event) => {
        bar.onBar(event.nativeEvent.layout.width);
      }}
    >
      <DesktopTitle row={row} back={back} bar={bar} />
      <BarInline search={search} bar={bar} />
      <BarTrailing search={search} bar={bar} wide>
        <ShellControls controls={row.controls} />
        <ShellActions {...row.actions} kind="pointer" />
      </BarTrailing>
    </View>
  );
}

export function shellRowsShown(
  options: ReactNode,
  tabs: ShellTabs | undefined,
  toolbar: ReactNode,
): boolean {
  return options !== undefined || tabs !== undefined || toolbar !== undefined;
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
  options,
  tabs,
  toolbar,
  controls,
  column,
}: {
  readonly options: ReactNode;
  readonly tabs: ShellTabs | undefined;
  readonly toolbar: ReactNode;
  readonly controls: ReactNode;
  readonly column: ShellColumn;
}): ReactNode {
  if (!shellRowsShown(options, tabs, toolbar)) return null;
  return (
    <View style={columnStyle(column)} className="gap-2 pb-2">
      {options === undefined ? null : <View testID="shell-search-options">{options}</View>}
      {tabs === undefined ? null : (
        <BesideControls controls={touchControlsPlaceOf(tabs) === 'tabs' ? controls : undefined}>
          <View testID="shell-tabs">
            <TabsBar items={tabs.items} active={tabs.active} label={tabs.label} />
          </View>
        </BesideControls>
      )}
      {toolbar === undefined ? null : <View testID="shell-toolbar">{toolbar}</View>}
    </View>
  );
}
