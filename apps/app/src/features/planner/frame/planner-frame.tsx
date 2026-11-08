import { background } from '@smarteverything/logging';
import { useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { ScrollView, View, type TextInput } from 'react-native';
import { href } from '../../../app-shell/hrefs';
import { Banner } from '../../../components/banner';
import { PageHeader, type HeaderAction } from '../../../components/page-header';
import { Screen } from '../../../components/screen';
import { CompactBody, WideBody, type FrameWidth } from '../../../components/section-body';
import { useIdiom } from '../../../design/platform';
import { useAreaWidth } from '../../../design/size-class';
import { longDate } from '../../../format/time';
import { useMinuteOf } from '../../../store/clock';
import { useHubOffline } from '../../clock/frame/hub-status';
import {
  useGoogleAccount,
  usePlannerReload,
  usePlannerSummary,
  usePlannerSyncOnVisible,
} from '../data';
import type { PlannerSection } from '../model/section-routes';
import { PlannerFrameContext, type PlannerFrameValue } from './frame-context';
import { usePersonChoices, usePlannerShownPerson, type PersonChoice } from './person';
import { PersonPicker } from './person-picker';
import { plannerMenu } from './planner-menu';
import { PlannerRail } from './planner-rail';
import { PlannerTabs } from './planner-tabs';
import { QuickAddBar, ScrollAwayBar } from './quick-add-bar';
import { usePlannerQuickAdd } from './quick-add';
import { plannerSubtitleOf, todaySummaryOf } from './rail-summary';
import {
  PLANNER_QUICK_ADD_TARGET,
  frameLayoutOf,
  plannerSectionOf,
  plannerTitleOf,
  railWidthOf,
} from './sections';

export interface PlannerFrameProps {
  readonly section: PlannerSection;
  readonly subtitle?: string;
  readonly actions?: readonly HeaderAction[];
  readonly toolbar?: ReactNode;
  readonly width?: FrameWidth;
  readonly scroll?: boolean;
  readonly children: ReactNode;
}

const ASK_AI: HeaderAction = { icon: 'sparkles', label: 'Ask AI', href: href.assistantChat() };

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
      'planner.reload_failed',
    );
  };
  return { refreshing, onRefresh };
}

function useSubtitle(section: PlannerSection, subtitle: string | undefined): string {
  const date = useMinuteOf((now) => longDate(new Date(now)));
  const summary = usePlannerSummary(usePlannerShownPerson());
  if (subtitle !== undefined) return subtitle;
  return plannerSubtitleOf(date, section === 'index' ? todaySummaryOf(summary) : null);
}

interface QuickAddSlot {
  readonly section: PlannerSection;
  readonly frame: PlannerFrameValue;
  readonly inputRef: RefObject<TextInput | null>;
}

function PlannerQuickAdd({ section, frame, inputRef }: QuickAddSlot): ReactNode {
  const add = usePlannerQuickAdd(frame.person);
  return (
    <QuickAddBar
      target={PLANNER_QUICK_ADD_TARGET}
      hint={plannerSectionOf(section).hint}
      onAdd={add}
      disabled={frame.offline}
      inputRef={inputRef}
    />
  );
}

function WideColumn({
  scroll,
  quickAdd,
  children,
}: {
  readonly scroll: boolean;
  readonly quickAdd: ReactNode;
  readonly children: ReactNode;
}): ReactNode {
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

interface BodyProps {
  readonly section: PlannerSection;
  readonly scroll: boolean;
  readonly width: FrameWidth;
  readonly quickAdd: ReactNode;
  readonly children: ReactNode;
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
      rail={<PlannerRail active={section} width={railWidth} />}
      railWidth={railWidth}
    >
      <WideColumn scroll={scroll} quickAdd={quickAdd}>
        {children}
      </WideColumn>
    </WideBody>
  );
}

function headerBelow(
  compact: boolean,
  section: PlannerSection,
  people: readonly PersonChoice[],
  toolbar: ReactNode,
): ReactNode {
  if (compact) {
    return (
      <>
        <PlannerTabs active={section} />
        {toolbar}
      </>
    );
  }
  if (people.length === 0 && toolbar === undefined) return undefined;
  return (
    <View className="flex-row flex-wrap items-center gap-2">
      {people.length === 0 ? null : <PersonPicker people={people} />}
      {toolbar}
    </View>
  );
}

function useFrameValue(inputRef: RefObject<TextInput | null>): PlannerFrameValue {
  const person = usePlannerShownPerson();
  const offline = useHubOffline();
  return useMemo(
    () => ({
      person,
      offline,
      focusQuickAdd: (): void => {
        inputRef.current?.focus();
      },
    }),
    [person, offline, inputRef],
  );
}

interface HeaderInput {
  readonly section: PlannerSection;
  readonly subtitle: string | undefined;
  readonly actions: readonly HeaderAction[];
  readonly toolbar: ReactNode;
}

function FrameHeader({ section, subtitle, actions, toolbar }: HeaderInput): ReactNode {
  const area = useAreaWidth();
  const compact = frameLayoutOf(area) === 'compact';
  const pointer = useIdiom() === 'pointer';
  const people = usePersonChoices();
  const google = useGoogleAccount();
  return (
    <PageHeader
      title={plannerTitleOf(section, area)}
      subtitle={useSubtitle(section, subtitle)}
      back={false}
      actions={[...actions, ASK_AI]}
      overflow={plannerMenu({
        people: pointer ? [] : people,
        insights: compact,
        googleNeedsAttention: google.needsAttention,
      })}
      below={headerBelow(compact, section, pointer ? people : [], toolbar)}
    />
  );
}

export function PlannerFrame({
  section,
  subtitle,
  actions = [],
  toolbar,
  width = 'detail',
  scroll = true,
  children,
}: PlannerFrameProps): ReactNode {
  usePlannerSyncOnVisible();
  const compact = frameLayoutOf(useAreaWidth()) === 'compact';
  const inputRef = useRef<TextInput>(null);
  const frame = useFrameValue(inputRef);
  const { refreshing, onRefresh } = useRefresh();
  const quickAdd = <PlannerQuickAdd section={section} frame={frame} inputRef={inputRef} />;
  return (
    <PlannerFrameContext value={frame}>
      <Screen
        maxWidth={compact ? width : 'full'}
        scroll={compact ? scroll : false}
        onRefresh={onRefresh}
        refreshing={refreshing}
        {...(frame.offline ? { banner: <OfflineBanner /> } : {})}
        {...(compact ? { footer: <ScrollAwayBar>{quickAdd}</ScrollAwayBar> } : {})}
        header={
          <FrameHeader section={section} subtitle={subtitle} actions={actions} toolbar={toolbar} />
        }
      >
        <FrameBody section={section} scroll={scroll} width={width} quickAdd={quickAdd}>
          {children}
        </FrameBody>
      </Screen>
    </PlannerFrameContext>
  );
}
