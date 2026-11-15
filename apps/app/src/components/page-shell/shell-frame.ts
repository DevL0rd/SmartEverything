import type { ReactNode } from 'react';
import type { LayoutChangeEvent } from 'react-native';
import type Animated from 'react-native-reanimated';
import type { AnimatedRef, SharedValue } from 'react-native-reanimated';
import type { HeaderKind } from '../../design/size-class';
import type { IconName } from '../icon';
import type { RailWidth, ShellColumn } from './layout';
import { searchPanelShown } from './search-slot';
import type { ShellRefresh } from './shell-body';
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
  readonly icon: IconName | null;
  readonly onTop: ((height: number) => void) | null;
}

export function topLayoutOf(frame: FrameProps): {
  readonly onLayout?: (event: LayoutChangeEvent) => void;
} {
  const { onTop } = frame;
  if (onTop === null) return {};
  return {
    onLayout: (event): void => {
      onTop(event.nativeEvent.layout.height);
    },
  };
}

export function titleRowOf(shell: StandardShellProps, icon: IconName | null): TitleRowProps {
  return {
    back: shell.back !== false,
    controls: shell.controls,
    title: {
      title: shell.title,
      subtitle: shell.subtitle,
      breadcrumbs: shell.breadcrumbs,
      icon,
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

export function besideRail(frame: FrameProps): FrameProps {
  const { layout } = frame;
  if (layout.rail === null) return frame;
  return {
    ...frame,
    layout: { ...layout, column: { left: layout.gutter, width: layout.column.width } },
  };
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
