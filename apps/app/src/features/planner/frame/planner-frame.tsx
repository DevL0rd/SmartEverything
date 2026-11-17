import { background } from '@smarteverything/logging';
import { use, useMemo, useState, type ReactNode } from 'react';
import { router, useIsFocused } from 'expo-router';
import { View } from 'react-native';
import { href } from '../../../app-shell/hrefs';
import { mainPageSettings } from '../../../app-shell/main-pages';
import type { MenuItem } from '../../../components/menu';
import { PANE_HANDLE_WIDTH } from '../../../components/docked-pane';
import { asideFitOf, type AsideFit } from '../../../components/page-shell/layout';
import { PageShell } from '../../../components/page-shell/page-shell';
import type { ShellSearchConfig } from '../../../components/page-shell/search-slot';
import type { ShellAction } from '../../../components/page-shell/shell-actions';
import { ShellInsetContext } from '../../../components/page-shell/shell-inset';
import type { ShellSections } from '../../../components/page-shell/shell-sections';
import type { ShellAside } from '../../../components/page-shell/shell-types';
import { useIdiom } from '../../../design/platform';
import { useSizeClass } from '../../../design/size-class';
import { longDate, shortDate, weekdayShort } from '../../../format/time';
import { useMinuteOf } from '../../../store/clock';
import { useHubOffline } from '../../clock';
import {
  useGoogleAccount,
  usePlannerReload,
  usePlannerSummary,
  usePlannerSyncOnVisible,
} from '../data';
import { PLANNER_ITEM_PANEL, PlannerItemPanel } from '../item/side-panel';
import {
  clearPlannerSelection,
  usePanelHost,
  usePanelWidth,
  usePlannerSelection,
} from '../item/selection';
import type { PlannerSection } from '../model/section-routes';
import { PlannerFrameContext, type PlannerFrameValue, type QuickAddSeed } from './frame-context';
import { usePersonChoices, usePlannerShownPerson, type PersonChoice } from './person';
import { PersonPicker } from './person-picker';
import { plannerMenu } from './planner-menu';
import { plannerSectionsOf } from './planner-sections';
import { QuickAddBar, QuickAddComposer } from './quick-add-bar';
import { plannerComposerKindOf, useComposerControl, type ComposerControl } from './quick-add';
import { plannerSubtitleOf, todaySummaryOf } from './rail-summary';
import { usePlannerSearchKey, withPlannerSearch } from './search-key';
import { PLANNER_QUICK_ADD_TARGET, plannerSectionOf } from './sections';

export interface PlannerFrameProps {
  readonly section: PlannerSection;
  readonly subtitle?: string;
  readonly actions?: readonly ShellAction[];
  readonly toolbar?: ReactNode;
  readonly search?: ShellSearchConfig;
  readonly scroll?: boolean;
  readonly menu?: readonly MenuItem[];
  readonly summary?: boolean;
  readonly children: ReactNode;
}

const ASK_AI: ShellAction = { icon: 'sparkles', label: 'Ask AI', href: href.assistantChat() };

const ASK_AI_ITEM: MenuItem = {
  id: 'ask-ai',
  label: 'Ask AI',
  icon: 'sparkles',
  onPress: (): void => {
    router.push(href.assistantChat());
  },
};

function refreshItemOf(refresh: Refresh): MenuItem {
  return {
    id: 'refresh',
    label: refresh.refreshing ? 'Refreshing…' : 'Refresh',
    icon: 'refresh',
    disabled: refresh.refreshing,
    onPress: refresh.onRefresh,
  };
}

interface Refresh {
  readonly refreshing: boolean;
  readonly onRefresh: () => void;
}

function useRefresh(): Refresh {
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

function refreshPropsOf(
  refresh: Refresh,
  shown: boolean,
): { readonly onRefresh?: () => void; readonly refreshing?: boolean } {
  return shown ? { onRefresh: refresh.onRefresh, refreshing: refresh.refreshing } : {};
}

function dateOf(now: number, phone: boolean): string {
  return phone ? `${weekdayShort(now)} ${shortDate(now)}` : longDate(new Date(now));
}

function useSubtitle(
  section: PlannerSection,
  subtitle: string | undefined,
  counted: boolean,
  phone: boolean,
): string {
  const date = useMinuteOf((now) => dateOf(now, phone));
  const summary = usePlannerSummary(usePlannerShownPerson());
  if (subtitle !== undefined) return subtitle;
  return plannerSubtitleOf(date, section === 'index' && counted ? todaySummaryOf(summary) : null);
}

function useFrameValue(section: PlannerSection, composer: ComposerControl): PlannerFrameValue {
  const person = usePlannerShownPerson();
  const offline = useHubOffline();
  const { open } = composer;
  return useMemo(
    () => ({
      person,
      offline,
      focusQuickAdd: (seed: QuickAddSeed = {}): void => {
        open({
          text: `${seed.due === undefined ? '' : `${seed.due} `}${seed.text ?? ''}`,
          kind: plannerComposerKindOf(section),
          ...(seed.collectionId === undefined ? {} : { collectionId: seed.collectionId }),
        });
      },
    }),
    [person, offline, open, section],
  );
}

function useAsideFit(): AsideFit {
  const size = useSizeClass();
  const area = size.area - use(ShellInsetContext);
  const width = usePanelWidth() + PANE_HANDLE_WIDTH;
  return size.header === 'large' ? 'sheet' : asideFitOf(area, 'sections', width);
}

function sectionsOf(section: PlannerSection, fit: AsideFit, open: boolean): ShellSections {
  const sections = plannerSectionsOf(section);
  return fit === 'beside-icon-rail' && open ? { ...sections, iconRail: true } : sections;
}

function PanelHost(): null {
  usePanelHost();
  return null;
}

function useItemAside(): ShellAside {
  const open = usePlannerSelection() !== null;
  const width = usePanelWidth() + PANE_HANDLE_WIDTH;
  return {
    label: PLANNER_ITEM_PANEL,
    open,
    width,
    onClose: clearPlannerSelection,
    children: <PlannerItemPanel />,
  };
}

function toolbarOf(people: readonly PersonChoice[], toolbar: ReactNode): ReactNode {
  if (people.length === 0) return toolbar;
  return (
    <View className="flex-row flex-wrap items-center gap-2">
      <PersonPicker people={people} />
      {toolbar}
    </View>
  );
}

interface TopInput {
  readonly section: PlannerSection;
  readonly actions: readonly ShellAction[];
  readonly toolbar: ReactNode;
  readonly search: ShellSearchConfig | undefined;
  readonly menu: readonly MenuItem[] | undefined;
  readonly refresh: Refresh;
}

function useTop({ section, actions, toolbar, search, menu, refresh }: TopInput): {
  readonly title: string;
  readonly actions: readonly ShellAction[];
  readonly overflow: readonly MenuItem[];
  readonly toolbar: ReactNode;
} {
  const pointer = useIdiom() === 'pointer';
  const inline = useSizeClass().header !== 'large';
  const people = usePersonChoices();
  const google = useGoogleAccount();
  const focused = useIsFocused();
  usePlannerSearchKey(pointer && focused && search === undefined);
  const base = plannerMenu({
    people: inline ? [] : people,
    googleNeedsAttention: google.needsAttention,
  });
  const searched = withPlannerSearch(actions, search !== undefined);
  return {
    title: plannerSectionOf(section).label,
    actions: menu === undefined ? [...searched, ASK_AI] : searched,
    overflow: menu === undefined ? base : [...menu, ASK_AI_ITEM, refreshItemOf(refresh), ...base],
    toolbar: toolbarOf(inline ? people : [], toolbar),
  };
}

function PlannerQuickAdd({
  section,
  frame,
  phone,
}: {
  readonly section: PlannerSection;
  readonly frame: PlannerFrameValue;
  readonly phone: boolean;
}): ReactNode {
  const def = plannerSectionOf(section);
  return (
    <QuickAddBar
      target={PLANNER_QUICK_ADD_TARGET}
      hint={phone ? def.phoneHint : def.hint}
      onOpen={() => {
        frame.focusQuickAdd();
      }}
      disabled={frame.offline}
    />
  );
}

function footerOf(
  section: PlannerSection,
  frame: PlannerFrameValue,
  phone: boolean,
): { readonly footer: ReactNode; readonly footerHides?: 'scroll' } {
  const footer = <PlannerQuickAdd section={section} frame={frame} phone={phone} />;
  return phone ? { footer, footerHides: 'scroll' } : { footer };
}

export function PlannerFrame({
  section,
  subtitle,
  actions = [],
  toolbar,
  search,
  scroll = true,
  menu,
  summary = true,
  children,
}: PlannerFrameProps): ReactNode {
  usePlannerSyncOnVisible();
  const phone = useSizeClass().header === 'large';
  const fit = useAsideFit();
  const dockable = fit !== 'sheet';
  const composer = useComposerControl();
  const frame = useFrameValue(section, composer);
  const refresh = useRefresh();
  const top = useTop({ section, actions, toolbar, search, menu, refresh });
  const aside = useItemAside();
  return (
    <PlannerFrameContext value={frame}>
      {dockable ? <PanelHost /> : null}
      <PageShell
        title={top.title}
        subtitle={useSubtitle(section, subtitle, summary, phone)}
        back={false}
        actions={top.actions}
        overflow={top.overflow}
        settings={mainPageSettings('planner')}
        sections={sectionsOf(section, fit, aside.open)}
        scroll={scroll}
        {...refreshPropsOf(refresh, menu === undefined || phone)}
        {...footerOf(section, frame, phone)}
        {...(dockable ? { aside } : {})}
        {...(top.toolbar === undefined ? {} : { toolbar: top.toolbar })}
        {...(search === undefined ? {} : { search })}
      >
        {children}
        <QuickAddComposer
          control={composer}
          target={PLANNER_QUICK_ADD_TARGET}
          person={frame.person}
          disabled={frame.offline}
        />
      </PageShell>
    </PlannerFrameContext>
  );
}
