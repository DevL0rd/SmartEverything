import type { ReactNode } from 'react';
import { View } from 'react-native';
import { barOptionsOf, useSearchOptionsPlace } from './bar-search';
import { BodyColumn, ShellScroll, StaticBody } from './shell-body';
import {
  besideRail,
  bodyOf,
  refreshOf,
  selecting,
  titleRowOf,
  topLayoutOf,
  type FrameProps,
} from './shell-frame';
import { ShellRail } from './shell-sections';
import { SelectionBar } from './shell-status';
import {
  AppBar,
  SURFACE_AT,
  ShellRows,
  TopSurface,
  columnStyle,
  touchControlsPlaceOf,
} from './top-shell';

function PhoneTop({ frame }: { readonly frame: FrameProps }): ReactNode {
  const { shell, layout, scrollY } = frame;
  const place = useSearchOptionsPlace();
  return (
    <View testID="shell-top" className="z-10 pt-safe" {...topLayoutOf(frame)}>
      <TopSurface scrollY={scrollY} from={0} to={SURFACE_AT} />
      {selecting(shell) ? (
        <SelectionBar>{shell.selection}</SelectionBar>
      ) : (
        <AppBar
          row={titleRowOf(shell, frame.icon)}
          column={layout.column}
          controls={touchControlsPlaceOf(shell.tabs) === 'title'}
          search={shell.search}
        />
      )}
      <ShellRows
        options={barOptionsOf(shell.search, place)}
        tabs={shell.tabs}
        toolbar={shell.toolbar}
        controls={shell.controls}
        column={layout.column}
      />
    </View>
  );
}

function PhoneColumn({ frame }: { readonly frame: FrameProps }): ReactNode {
  const { shell, layout } = frame;
  return (
    <>
      <PhoneTop frame={frame} />
      {shell.scroll === false ? (
        <StaticBody column={layout.column} banner={shell.banner} fab={frame.fab}>
          {bodyOf(shell)}
        </StaticBody>
      ) : (
        <ShellScroll
          scrollRef={frame.scrollRef}
          refresh={refreshOf(shell)}
          left={0}
          fab={frame.fab}
        >
          <View style={columnStyle(layout.column)} className="pt-2">
            <BodyColumn column={layout.column} banner={shell.banner} fill={false}>
              {bodyOf(shell)}
            </BodyColumn>
          </View>
        </ShellScroll>
      )}
    </>
  );
}

export function PhoneFrame(frame: FrameProps): ReactNode {
  const { shell, layout } = frame;
  if (layout.rail === null || shell.sections === undefined) return <PhoneColumn frame={frame} />;
  return (
    <View className="min-h-0 flex-1 flex-row">
      <ShellRail sections={shell.sections} rail={layout.rail} safeTop />
      <View testID="shell-content" className="min-h-0 min-w-0 flex-1">
        <PhoneColumn frame={besideRail(frame)} />
      </View>
    </View>
  );
}
