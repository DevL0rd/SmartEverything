import { useState, type ReactElement, type ReactNode } from 'react';
import { View } from 'react-native';
import type { AppHref } from '../app-href';
import type { Crumb } from '../breadcrumbs';
import type { RailWidth } from '../page-shell/layout';
import { PageHeader, type HeaderAction, type HeaderEditing } from '../page-header';
import type { PageSettingsLink } from '../page-settings-button';
import type { PrimaryActionProps } from '../primary-action';
import { Screen } from '../screen';
import { useHeaderSlot } from '../screen-context';
import { CompactBody, WideBody, type FrameWidth } from '../section-body';
import { SectionRail } from '../page-shell/section-rail';
import { useAreaWidth, useSizeClass } from '../../design/size-class';
import { SectionPullUp } from './section-pull-up';
import {
  libraryLayoutOf,
  libraryRailWidthOf,
  railGroupsOf,
  type LibrarySectionGroup,
} from './sections';

export type LibraryArea = 'photos' | 'drive';

export interface LibraryRefresh {
  readonly refreshing: boolean;
  readonly refresh: () => void;
}

export interface LibraryFrameProps {
  readonly area: LibraryArea;
  readonly title: string;
  readonly subtitle?: string;
  readonly breadcrumbs?: readonly Crumb[];
  readonly actions?: readonly HeaderAction[];
  readonly settings: PageSettingsLink;
  readonly refresh: LibraryRefresh;
  readonly editing?: HeaderEditing | null;
  readonly sections: readonly LibrarySectionGroup[];
  readonly active: string;
  readonly hrefOf: (id: string) => AppHref;
  readonly summary?: ReactNode;
  readonly renderPullUpFooter?: (close: () => void) => ReactNode;
  readonly iconRail?: boolean;
  readonly chips?: ReactNode;
  readonly banner?: ReactNode;
  readonly selection?: ReactElement | null;
  readonly footer?: ReactNode;
  readonly primaryAction?: PrimaryActionProps;
  readonly width?: FrameWidth;
  readonly scroll?: boolean;
  readonly children: ReactNode;
}

const NO_ACTIONS: readonly HeaderAction[] = [];

function railFooterOf(width: RailWidth, summary: ReactNode): ReactNode {
  return width === 'icon' ? undefined : summary;
}

function LibraryRail({
  frame,
  width,
}: {
  readonly frame: LibraryFrameProps;
  readonly width: RailWidth;
}): ReactNode {
  const footer = railFooterOf(width, frame.summary);
  return (
    <SectionRail
      groups={railGroupsOf(frame.sections)}
      active={frame.active}
      width={width}
      hrefOf={frame.hrefOf}
      {...(footer === undefined ? {} : { footer })}
    />
  );
}

function FrameBody({
  frame,
  area,
}: {
  readonly frame: LibraryFrameProps;
  readonly area: number;
}): ReactNode {
  const scroll = frame.scroll ?? true;
  const width = frame.width ?? 'dashboard';
  if (libraryLayoutOf(area) === 'compact') {
    return (
      <CompactBody scroll={scroll} width={width}>
        {frame.chips}
        {frame.children}
      </CompactBody>
    );
  }
  const railWidth = frame.iconRail === true ? 'icon' : libraryRailWidthOf(area);
  return (
    <WideBody
      scroll={scroll}
      width={width}
      rail={<LibraryRail frame={frame} width={railWidth} />}
      railWidth={railWidth}
    >
      {frame.children}
    </WideBody>
  );
}

function headerActionsOf(
  compact: boolean,
  actions: readonly HeaderAction[],
  refresh: () => void,
): readonly HeaderAction[] {
  return compact
    ? actions
    : [...actions, { icon: 'refresh', label: 'Refresh', iconOnly: true, onPress: refresh }];
}

function FrameHeader({
  frame,
  compact,
  refresh,
  onTitlePress,
}: {
  readonly frame: LibraryFrameProps;
  readonly compact: boolean;
  readonly refresh: () => void;
  readonly onTitlePress: () => void;
}): ReactNode {
  return (
    <PageHeader
      title={frame.title}
      settings={frame.settings}
      back={false}
      actions={headerActionsOf(compact, frame.actions ?? NO_ACTIONS, refresh)}
      editing={frame.editing ?? null}
      {...(frame.subtitle === undefined ? {} : { subtitle: frame.subtitle })}
      {...(frame.breadcrumbs === undefined ? {} : { breadcrumbs: frame.breadcrumbs })}
      {...(compact ? { onTitlePress } : {})}
    />
  );
}

function SelectionHeader({ children }: { readonly children: ReactElement }): ReactNode {
  const slot = useHeaderSlot();
  const desktop = useSizeClass().header === 'desktop';
  if ((slot === 'large') !== desktop) return null;
  return desktop ? children : <View className="z-10 pt-safe">{children}</View>;
}

function screenExtrasOf(frame: LibraryFrameProps): {
  readonly footer?: ReactNode;
  readonly primaryAction?: PrimaryActionProps;
} {
  const selection = frame.selection ?? null;
  const footer = frame.footer ?? null;
  return {
    ...(footer === null ? {} : { footer }),
    ...(frame.primaryAction === undefined || selection !== null
      ? {}
      : { primaryAction: frame.primaryAction }),
  };
}

function headerOf(
  frame: LibraryFrameProps,
  compact: boolean,
  refresh: () => void,
  openPullUp: () => void,
): ReactElement {
  const selection = frame.selection ?? null;
  if (selection !== null) return <SelectionHeader>{selection}</SelectionHeader>;
  return (
    <FrameHeader frame={frame} compact={compact} refresh={refresh} onTitlePress={openPullUp} />
  );
}

export function LibraryFrame(frame: LibraryFrameProps): ReactNode {
  const [pullUp, setPullUp] = useState(false);
  const area = useAreaWidth();
  const compact = libraryLayoutOf(area) === 'compact';
  const { refreshing, refresh } = frame.refresh;
  const scrolls = compact && (frame.scroll ?? true);
  const closePullUp = (): void => {
    setPullUp(false);
  };
  return (
    <Screen
      maxWidth={compact ? (frame.width ?? 'dashboard') : 'full'}
      scroll={scrolls}
      header={headerOf(frame, compact, refresh, () => {
        setPullUp(true);
      })}
      onRefresh={refresh}
      refreshing={refreshing}
      banner={frame.banner}
      {...screenExtrasOf(frame)}
    >
      <FrameBody frame={frame} area={area} />
      {compact ? (
        <SectionPullUp
          open={pullUp}
          onClose={closePullUp}
          title={frame.title}
          groups={frame.sections}
          active={frame.active}
          hrefOf={frame.hrefOf}
          summary={frame.summary}
          footer={frame.renderPullUpFooter?.(closePullUp)}
        />
      ) : null}
    </Screen>
  );
}
