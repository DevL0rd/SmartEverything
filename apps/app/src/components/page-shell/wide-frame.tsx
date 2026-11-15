import type { ReactNode } from 'react';
import { View } from 'react-native';
import { cn } from '../../design/cn';
import type { RailWidth } from './layout';
import { SectionRail } from './section-rail';
import { BodyColumn, ShellScroll, StaticBody } from './shell-body';
import {
  bodyOf,
  refreshOf,
  selecting,
  tabRowsOf,
  titleRowOf,
  type FrameProps,
} from './shell-frame';
import type { ShellSections } from './shell-sections';
import type { ShellAside } from './shell-types';
import {
  AppBar,
  DesktopTitleRow,
  SURFACE_AT,
  ShellRows,
  shellRowsShown,
  TopSurface,
  asideStyle,
  columnStyle,
  railOffsetStyle,
} from './top-shell';

function ShellRail({
  sections,
  rail,
  gutter,
}: {
  readonly sections: ShellSections;
  readonly rail: RailWidth;
  readonly gutter: number;
}): ReactNode {
  return (
    <View testID="shell-rail" style={railOffsetStyle(gutter)} className="flex-row pt-2">
      <SectionRail
        groups={sections.groups}
        active={sections.active}
        width={rail}
        hrefOf={sections.hrefOf}
        navigation={sections.navigation}
        {...(rail === 'icon' || sections.footer === undefined ? {} : { footer: sections.footer })}
      />
    </View>
  );
}

function WideTitle({ frame }: { readonly frame: FrameProps }): ReactNode {
  const { shell, layout, scrollY } = frame;
  const desktop = layout.header === 'desktop';
  if (selecting(shell)) {
    return <View style={desktop ? columnStyle(layout.column) : undefined}>{shell.selection}</View>;
  }
  const row = titleRowOf(shell, frame.openPullUp);
  return desktop ? (
    <DesktopTitleRow row={row} search={shell.search} column={layout.column} />
  ) : (
    <AppBar row={row} large={false} scrollY={scrollY} column={layout.column} />
  );
}

function WideTop({ frame }: { readonly frame: FrameProps }): ReactNode {
  const { shell, layout, scrollY } = frame;
  const desktop = layout.header === 'desktop';
  const search = desktop ? undefined : shell.search;
  const tabs = tabRowsOf(shell, layout);
  return (
    <View testID="shell-top" className={cn('z-10', desktop ? 'pb-2' : 'pt-safe')}>
      <TopSurface scrollY={scrollY} from={0} to={SURFACE_AT} />
      <WideTitle frame={frame} />
      {shellRowsShown(search, tabs, shell.toolbar) ? (
        <View className={desktop ? 'pt-2' : ''}>
          <ShellRows search={search} tabs={tabs} toolbar={shell.toolbar} column={layout.column} />
        </View>
      ) : null}
    </View>
  );
}

function DockedAside({ aside }: { readonly aside: ShellAside }): ReactNode {
  return (
    <View
      testID="shell-aside"
      style={asideStyle()}
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
      <StaticBody column={body} banner={shell.banner}>
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
      <WideBody frame={frame} />
      {layout.docked && shell.aside !== undefined ? <DockedAside aside={shell.aside} /> : null}
    </View>
  );
}

function besideRail(frame: FrameProps): FrameProps {
  const { layout } = frame;
  return {
    ...frame,
    layout: { ...layout, column: { left: layout.gutter, width: layout.column.width } },
  };
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
  const rail = <ShellRail sections={shell.sections} rail={layout.rail} gutter={layout.gutter} />;
  if (layout.header === 'desktop') {
    const beside = besideRail(frame);
    return (
      <View className="min-h-0 flex-1 flex-row">
        {rail}
        <View className="min-h-0 min-w-0 flex-1">
          <WideTop frame={beside} />
          <BodyRow frame={beside} />
        </View>
      </View>
    );
  }
  return (
    <>
      <WideTop frame={frame} />
      <View className="min-h-0 flex-1 flex-row">
        {rail}
        <BodyRow frame={frame} />
      </View>
    </>
  );
}
