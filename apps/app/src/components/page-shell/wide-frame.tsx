import type { ReactNode } from 'react';
import { View } from 'react-native';
import { cn } from '../../design/cn';
import { barOptionsOf, useSearchOptionsPlace } from './bar-search';
import { BodyColumn, ShellFooter, ShellScroll, StaticBody } from './shell-body';
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
import type { ShellAside } from './shell-types';
import {
  AppBar,
  DesktopTitleRow,
  SURFACE_AT,
  ShellRows,
  shellRowsShown,
  TopSurface,
  columnStyle,
  touchControlsPlaceOf,
  widthStyle,
} from './top-shell';

function WideTitle({ frame }: { readonly frame: FrameProps }): ReactNode {
  const { shell, layout } = frame;
  const desktop = layout.header === 'desktop';
  if (selecting(shell)) {
    return <View style={desktop ? columnStyle(layout.column) : undefined}>{shell.selection}</View>;
  }
  const row = titleRowOf(shell, frame.icon);
  return desktop ? (
    <DesktopTitleRow row={row} search={shell.search} column={layout.column} />
  ) : (
    <AppBar
      row={{ ...row, back: row.back || shell.breadcrumbs !== undefined }}
      column={layout.column}
      controls={touchControlsPlaceOf(shell.tabs) === 'title'}
      search={shell.search}
    />
  );
}

function WideRows({ frame }: { readonly frame: FrameProps }): ReactNode {
  const { shell, layout } = frame;
  const desktop = layout.header === 'desktop';
  const searchOptionsPlace = useSearchOptionsPlace();
  const options = barOptionsOf(shell.search, searchOptionsPlace);
  const tabs = shell.tabs;
  if (!shellRowsShown(options, tabs, shell.toolbar)) return null;
  return (
    <View className={desktop ? 'pt-2' : ''}>
      <ShellRows
        options={options}
        tabs={tabs}
        toolbar={shell.toolbar}
        controls={desktop ? undefined : shell.controls}
        column={layout.column}
      />
    </View>
  );
}

function WideTop({ frame }: { readonly frame: FrameProps }): ReactNode {
  const { layout, scrollY } = frame;
  const desktop = layout.header === 'desktop';
  return (
    <View
      testID="shell-top"
      className={cn('z-10', desktop ? 'pb-2' : 'pt-safe')}
      {...topLayoutOf(frame)}
    >
      <TopSurface scrollY={scrollY} from={0} to={SURFACE_AT} />
      <WideTitle frame={frame} />
      <WideRows frame={frame} />
    </View>
  );
}

function DockedAside({ aside }: { readonly aside: ShellAside }): ReactNode {
  return (
    <View
      testID="shell-aside"
      style={widthStyle(aside.width)}
      className="border-l border-outline-variant bg-surface-1"
    >
      {aside.children}
    </View>
  );
}

function WideBody({ frame }: { readonly frame: FrameProps }): ReactNode {
  const { shell, layout } = frame;
  const body = { left: layout.gutter, width: layout.column.width };
  if (shell.scroll === false) {
    return (
      <StaticBody column={body} banner={shell.banner} fab={frame.fab}>
        {bodyOf(shell)}
      </StaticBody>
    );
  }
  return (
    <ShellScroll
      scrollRef={frame.scrollRef}
      refresh={refreshOf(shell)}
      left={body.left}
      fab={frame.fab}
    >
      <View className="pt-4">
        <BodyColumn column={layout.column} banner={shell.banner} fill={false}>
          {bodyOf(shell)}
        </BodyColumn>
      </View>
    </ShellScroll>
  );
}

function BodyRow({ frame }: { readonly frame: FrameProps }): ReactNode {
  const { shell, layout } = frame;
  return (
    <View className="min-h-0 flex-1 flex-row">
      <View className="min-h-0 min-w-0 flex-1">
        <WideBody frame={frame} />
        {shell.footer === undefined ? null : (
          <ShellFooter hides={shell.footerHides}>{shell.footer}</ShellFooter>
        )}
      </View>
      {layout.docked && shell.aside !== undefined ? <DockedAside aside={shell.aside} /> : null}
    </View>
  );
}

export function WideFrame(frame: FrameProps): ReactNode {
  const { shell, layout } = frame;
  if (layout.rail === null || shell.sections === undefined) {
    return (
      <>
        <WideTop frame={frame} />
        <BodyRow frame={frame} />
      </>
    );
  }
  const beside = besideRail(frame);
  return (
    <View className="min-h-0 flex-1 flex-row">
      <ShellRail
        sections={shell.sections}
        rail={layout.rail}
        safeTop={layout.header !== 'desktop'}
      />
      <View testID="shell-content" className="min-h-0 min-w-0 flex-1">
        <WideTop frame={beside} />
        <BodyRow frame={beside} />
      </View>
    </View>
  );
}
