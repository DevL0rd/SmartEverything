import type { ReactNode } from 'react';
import type Animated from 'react-native-reanimated';
import type { AnimatedRef, SharedValue } from 'react-native-reanimated';
import type { HeaderKind } from '../../design/size-class';
import type { RailWidth, ShellColumn } from './layout';
import { searchPanelShown } from './search-slot';
import type { ShellRefresh } from './shell-body';
import { phoneTabsOf, type ShellSections, type ShellTabRow } from './shell-sections';
import type { StandardShellProps } from './shell-types';
import type { TitleRowProps } from './top-shell';

export interface ShellLayout {
  readonly header: HeaderKind;
  readonly gutter: number;
  readonly rail: RailWidth | null;
  readonly docked: boolean;
  readonly column: ShellColumn;
}

export interface FrameProps {
  readonly shell: StandardShellProps;
  readonly layout: ShellLayout;
  readonly scrollY: SharedValue<number>;
  readonly scrollRef: AnimatedRef<Animated.ScrollView>;
  readonly fab: boolean;
  readonly openPullUp: (() => void) | undefined;
}

export function titleRowOf(
  shell: StandardShellProps,
  onTitlePress: (() => void) | undefined,
): TitleRowProps {
  return {
    back: shell.back !== false,
    controls: shell.controls,
    title: {
      title: shell.title,
      subtitle: shell.subtitle,
      breadcrumbs: shell.breadcrumbs,
      onPress: onTitlePress,
    },
    actions: {
      actions: shell.actions,
      overflow: shell.overflow,
      settings: shell.settings,
      editing: shell.editing,
      primaryAction: shell.primaryAction,
      refresh:
        shell.onRefresh === undefined
          ? undefined
          : { onPress: shell.onRefresh, busy: shell.refreshing === true },
    },
  };
}

export function compactSections(
  shell: StandardShellProps,
  rail: RailWidth | null,
): ShellSections | undefined {
  return rail === null ? shell.sections : undefined;
}

export function tabRowsOf(shell: StandardShellProps, layout: ShellLayout): readonly ShellTabRow[] {
  const sections = compactSections(shell, layout.rail);
  const sectionTabs = sections === undefined ? null : phoneTabsOf(sections);
  return [
    ...(sectionTabs === null ? [] : [{ key: 'sections' as const, tabs: sectionTabs }]),
    ...(shell.tabs === undefined ? [] : [{ key: 'page' as const, tabs: shell.tabs }]),
  ];
}

export function bodyOf(shell: StandardShellProps): ReactNode {
  return searchPanelShown(shell.search) ? shell.search?.panel : shell.children;
}

export function refreshOf(shell: StandardShellProps): ShellRefresh {
  return { onRefresh: shell.onRefresh, refreshing: shell.refreshing ?? false };
}

export function selecting(shell: StandardShellProps): boolean {
  return shell.selection !== undefined && shell.selection !== null;
}

export function pinnedRows(shell: StandardShellProps, tabs: readonly ShellTabRow[]): boolean {
  return shell.search !== undefined || tabs.length > 0 || shell.toolbar !== undefined;
}
