import { useState, type ReactElement, type ReactNode } from 'react';
import { mainPageSettings } from '../../../app-shell/main-pages';
import type { AppHref } from '../../../components/app-href';
import type { Crumb } from '../../../components/breadcrumbs';
import type { RailWidth } from '../../../components/frame-layout';
import { PageHeader, type HeaderAction, type HeaderEditing } from '../../../components/page-header';
import type { PageSettingsLink } from '../../../components/page-settings-button';
import type { PrimaryActionProps } from '../../../components/primary-action';
import { Screen } from '../../../components/screen';
import { CompactBody, WideBody, type FrameWidth } from '../../../components/section-body';
import { SectionRail } from '../../../components/section-rail';
import { useAreaWidth } from '../../../design/size-class';
import { SectionPullUp } from './section-pull-up';
import {
  libraryLayoutOf,
  libraryRailWidthOf,
  railGroupsOf,
  type LibrarySectionGroup,
} from './sections';
import { useLibraryRefresh } from './use-library-refresh';

export type LibraryArea = 'photos' | 'drive';

export interface LibraryFrameProps {
  readonly area: LibraryArea;
  readonly title: string;
  readonly subtitle?: string;
  readonly breadcrumbs?: readonly Crumb[];
  readonly actions?: readonly HeaderAction[];
  readonly settings?: PageSettingsLink;
  readonly search?: boolean;
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
  readonly primaryAction?: PrimaryActionProps;
  readonly reconcileRootId?: string | null;
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
      settings={frame.settings ?? mainPageSettings(frame.area)}
      back={false}
      search={frame.search ?? true}
      actions={headerActionsOf(compact, frame.actions ?? NO_ACTIONS, refresh)}
      editing={frame.editing ?? null}
      {...(frame.subtitle === undefined ? {} : { subtitle: frame.subtitle })}
      {...(frame.breadcrumbs === undefined ? {} : { breadcrumbs: frame.breadcrumbs })}
      {...(compact ? { onTitlePress } : {})}
    />
  );
}

export function LibraryFrame(frame: LibraryFrameProps): ReactNode {
  const [pullUp, setPullUp] = useState(false);
  const area = useAreaWidth();
  const compact = libraryLayoutOf(area) === 'compact';
  const { refreshing, refresh } = useLibraryRefresh(frame.reconcileRootId ?? null);
  const scrolls = compact && (frame.scroll ?? true);
  const closePullUp = (): void => {
    setPullUp(false);
  };
  return (
    <Screen
      maxWidth={compact ? (frame.width ?? 'dashboard') : 'full'}
      scroll={scrolls}
      header={
        frame.selection ?? (
          <FrameHeader
            frame={frame}
            compact={compact}
            refresh={refresh}
            onTitlePress={() => {
              setPullUp(true);
            }}
          />
        )
      }
      onRefresh={refresh}
      refreshing={refreshing}
      banner={frame.banner}
      {...(frame.primaryAction === undefined ? {} : { primaryAction: frame.primaryAction })}
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
