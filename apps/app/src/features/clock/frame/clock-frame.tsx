import { background } from '@smarteverything/logging';
import { useState, type ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { Banner } from '../../../components/banner';
import { PageHeader, type HeaderAction } from '../../../components/page-header';
import { Screen } from '../../../components/screen';
import { CompactBody, WideBody, type FrameWidth } from '../../../components/section-body';
import { useAreaWidth } from '../../../design/size-class';
import { usePlannerReload } from '../../planner/data';
import { QuickAddBar, ScrollAwayBar } from '../../planner/frame/quick-add-bar';
import type { ClockSection } from '../model/section-routes';
import { clockMenu } from './clock-menu';
import { ClockRail } from './clock-rail';
import { ClockStrip } from './clock-strip';
import { useHubOffline } from './hub-status';
import { addClockText } from './quick-add';
import {
  CLOCK_QUICK_ADD_TARGET,
  clockSectionOf,
  clockTitleOf,
  frameLayoutOf,
  railWidthOf,
} from './sections';

export interface ClockFrameProps {
  readonly section: ClockSection;
  readonly subtitle?: string;
  readonly actions?: readonly HeaderAction[];
  readonly width?: FrameWidth;
  readonly scroll?: boolean;
  readonly children: ReactNode;
}

function OfflineBanner(): ReactNode {
  return (
    <Banner
      tone="info"
      title="Can’t reach the hub"
      body="Changes wait for the hub. Alarms set on this phone still ring."
      wrapBody
    />
  );
}

function useRefresh(): { readonly refreshing: boolean; readonly onRefresh: () => void } {
  const reload = usePlannerReload();
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = (): void => {
    setRefreshing(true);
    background(
      reload().finally(() => {
        setRefreshing(false);
      }),
      'clock.reload_failed',
    );
  };
  return { refreshing, onRefresh };
}

interface QuickAddSlot {
  readonly section: ClockSection;
  readonly offline: boolean;
}

function ClockQuickAdd({ section, offline }: QuickAddSlot): ReactNode {
  return (
    <QuickAddBar
      target={CLOCK_QUICK_ADD_TARGET}
      hint={clockSectionOf(section).hint}
      onAdd={addClockText}
      disabled={offline}
    />
  );
}

interface ColumnProps {
  readonly scroll: boolean;
  readonly quickAdd: ReactNode;
  readonly children: ReactNode;
}

function WideColumn({ scroll, quickAdd, children }: ColumnProps): ReactNode {
  return (
    <>
      {scroll ? (
        <ScrollView className="flex-1" contentContainerClassName="gap-section-gap pb-section-gap">
          {children}
        </ScrollView>
      ) : (
        <View className="flex-1 gap-section-gap">{children}</View>
      )}
      {quickAdd}
    </>
  );
}

interface BodyProps extends ColumnProps {
  readonly section: ClockSection;
  readonly width: FrameWidth;
}

function FrameBody({ section, scroll, width, quickAdd, children }: BodyProps): ReactNode {
  const area = useAreaWidth();
  if (frameLayoutOf(area) === 'compact') {
    return (
      <CompactBody scroll={scroll} width={width}>
        {children}
      </CompactBody>
    );
  }
  const railWidth = railWidthOf(area);
  return (
    <WideBody
      scroll={false}
      width={width}
      rail={<ClockRail active={section} width={railWidth} />}
      railWidth={railWidth}
    >
      <WideColumn scroll={scroll} quickAdd={quickAdd}>
        {children}
      </WideColumn>
    </WideBody>
  );
}

export function ClockFrame({
  section,
  subtitle,
  actions = [],
  width = 'detail',
  scroll = true,
  children,
}: ClockFrameProps): ReactNode {
  const area = useAreaWidth();
  const compact = frameLayoutOf(area) === 'compact';
  const offline = useHubOffline();
  const { refreshing, onRefresh } = useRefresh();
  const quickAdd = <ClockQuickAdd section={section} offline={offline} />;
  return (
    <Screen
      maxWidth={compact ? width : 'full'}
      scroll={compact ? scroll : false}
      onRefresh={onRefresh}
      refreshing={refreshing}
      {...(offline ? { banner: <OfflineBanner /> } : {})}
      {...(compact ? { footer: <ScrollAwayBar>{quickAdd}</ScrollAwayBar> } : {})}
      header={
        <PageHeader
          title={clockTitleOf(section, area)}
          {...(subtitle === undefined ? {} : { subtitle })}
          back={false}
          actions={actions}
          overflow={clockMenu()}
          {...(compact ? { below: <ClockStrip active={section} /> } : {})}
        />
      }
    >
      <FrameBody section={section} scroll={scroll} width={width} quickAdd={quickAdd}>
        {children}
      </FrameBody>
    </Screen>
  );
}
