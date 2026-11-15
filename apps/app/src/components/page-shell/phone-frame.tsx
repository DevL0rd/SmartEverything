import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';
import { BodyColumn, ShellScroll, StaticBody } from './shell-body';
import {
  bodyOf,
  pinnedRows,
  refreshOf,
  selecting,
  tabRowsOf,
  titleRowOf,
  type FrameProps,
} from './shell-frame';
import { ShellTitle } from './shell-parts';
import {
  AppBar,
  COLLAPSE_AT,
  SURFACE_AT,
  ShellRows,
  TopSurface,
  columnStyle,
  touchControlsPlaceOf,
} from './top-shell';

function StickyRows({
  scrollY,
  stuckAt,
  children,
}: {
  readonly scrollY: SharedValue<number>;
  readonly stuckAt: number;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <View className="pt-2">
      <TopSurface scrollY={scrollY} from={stuckAt - SURFACE_AT} to={stuckAt} />
      {children}
    </View>
  );
}

function LargeTitle({ frame }: { readonly frame: FrameProps }): ReactNode {
  return (
    <ShellTitle
      {...titleRowOf(frame.shell, frame.openPullUp).title}
      size="large"
      testID="shell-title"
    />
  );
}

function PhoneTop({
  frame,
  scroll,
  rows,
}: {
  readonly frame: FrameProps;
  readonly scroll: boolean;
  readonly rows: ReactNode | null;
}): ReactNode {
  const { shell, layout, scrollY } = frame;
  const tabs = tabRowsOf(shell, layout);
  const choosing = selecting(shell);
  const collapsing = scroll && !choosing;
  return (
    <View testID="shell-top" className="z-10 pt-safe">
      <TopSurface scrollY={scrollY} from={0} to={collapsing ? COLLAPSE_AT : SURFACE_AT} />
      {choosing ? (
        shell.selection
      ) : (
        <AppBar
          row={titleRowOf(shell, frame.openPullUp)}
          title={scroll ? 'collapsing' : 'none'}
          scrollY={scrollY}
          column={layout.column}
          controls={touchControlsPlaceOf(shell.search, tabs) === 'title'}
        />
      )}
      {scroll || choosing ? null : (
        <View style={columnStyle(layout.column)} className="pb-2 pt-1">
          <LargeTitle frame={frame} />
        </View>
      )}
      {rows}
    </View>
  );
}

function PhoneScroll({
  frame,
  rows,
  pinned,
}: {
  readonly frame: FrameProps;
  readonly rows: ReactNode;
  readonly pinned: boolean;
}): ReactNode {
  const [titleHeight, setTitleHeight] = useState(COLLAPSE_AT);
  const { shell, layout, scrollY } = frame;
  return (
    <ShellScroll
      scrollRef={frame.scrollRef}
      refresh={refreshOf(shell)}
      left={0}
      fab={frame.fab}
      {...(pinned ? { stickyHeaderIndices: [1] } : {})}
    >
      <View
        style={columnStyle(layout.column)}
        className="pb-2 pt-1"
        onLayout={(event) => {
          setTitleHeight(event.nativeEvent.layout.height);
        }}
      >
        {selecting(shell) ? null : <LargeTitle frame={frame} />}
      </View>
      {pinned ? (
        <StickyRows scrollY={scrollY} stuckAt={titleHeight}>
          {rows}
        </StickyRows>
      ) : null}
      <View style={columnStyle(layout.column)} className="pt-2">
        <BodyColumn column={layout.column} banner={shell.banner} fill={false}>
          {bodyOf(shell)}
        </BodyColumn>
      </View>
    </ShellScroll>
  );
}

export function PhoneFrame(frame: FrameProps): ReactNode {
  const { shell, layout } = frame;
  const scroll = shell.scroll !== false;
  const tabs = tabRowsOf(shell, layout);
  const rows = (
    <ShellRows
      search={shell.search}
      tabs={tabs}
      toolbar={shell.toolbar}
      controls={shell.controls}
      column={layout.column}
    />
  );
  return (
    <>
      <PhoneTop frame={frame} scroll={scroll} rows={scroll ? null : rows} />
      {scroll ? (
        <PhoneScroll frame={frame} rows={rows} pinned={pinnedRows(shell, tabs)} />
      ) : (
        <StaticBody column={layout.column} banner={shell.banner}>
          {bodyOf(shell)}
        </StaticBody>
      )}
    </>
  );
}
