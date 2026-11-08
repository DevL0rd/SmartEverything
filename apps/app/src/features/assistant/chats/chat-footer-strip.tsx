import { memo, useState, type ReactNode } from 'react';
import { Keyboard, View, type LayoutChangeEvent } from 'react-native';
import type { AiChatRow } from '@smarteverything/domain';
import { useGridLayout } from '../../../components/grid';
import { Icon } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { useMeasuredWidth } from '../../../components/use-measured-width';
import { useSizeClass } from '../../../design/size-class';
import { useMoney } from '../../region';
import { ChatBottomArea } from '../components/chat-bottom-area';
import { StatusWells } from '../components/bottom-status-bar';
import {
  activatedPanel,
  BOTTOM_AREA_ID,
  BOTTOM_GRID,
  COMPACT_BOTTOM_GRID_MIN_WIDTH,
  INITIAL_BOTTOM_VISIBILITY,
  groupedBottomVisibility,
  openedBottomReadings,
  toggledBottomArea,
  type BottomActivity,
  type BottomVisibility,
  type BottomPanel,
  type BottomReading,
} from '../components/bottom-status-model';
import { useChatActivity } from '../data/chat-activity';
import { useAssistantStatus } from '../data/assistant-data';
import { useFooterFacts } from '../data/chat-store';
import { useContextUsage } from '../data/context-usage';
import {
  HARNESS_FAILURE_ACTION_LABEL,
  type HarnessFailureAction,
} from '../details/harness-failure';
import { useFailureHandlers, useHarnessFailure } from '../details/use-harness-failure';
import { cachePercent, compactShown, costText } from '../model/chat-footer';
import { machineSwitchOf } from '../model/harness-handoff';
import {
  useChatBilling,
  useWeeklyAllowance,
  type ChatBilling,
} from '../provider/subscription-usage';
import type { WeeklyAllowance } from '../provider/subscription-usage-values';
import { CompactChatButton } from './compact-chat-button';
import { ReadingWells, type QuickBilling, type StripReadings } from './chat-quick-readings';
import { useExecutionLine } from './use-execution-line';

interface CostReadings {
  readonly quick: string | null;
  readonly total: string;
  readonly shown: boolean;
  readonly recorded: boolean;
}

function useCostReadings(chat: AiChatRow, working: boolean): CostReadings {
  const money = useMoney();
  const shown = useAssistantStatus()?.settings.reply_cost !== false;
  const { micros, incomplete } = useCostTotal(chat);
  const total = costText({ money, micros, incomplete, working });
  const unknown = incomplete && !working;
  return {
    quick: total,
    total: total ?? (unknown ? 'Unavailable' : money.cost(0)),
    shown,
    recorded: micros > 0,
  };
}

function useCostTotal(chat: AiChatRow): { readonly micros: number; readonly incomplete: boolean } {
  const facts = useFooterFacts(chat.id);
  return {
    micros: facts?.costMicros ?? chat.cost_micros,
    incomplete: facts?.costIncomplete ?? chat.cost_incomplete === true,
  };
}

function StripSwitch({
  label,
  onPress,
  children,
}: {
  readonly label: string;
  readonly onPress: () => void;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <Interactive
      label={label}
      onPress={onPress}
      className="min-h-touch-min justify-center rounded-sm px-2"
      layerClassName="rounded-sm"
    >
      {children}
    </Interactive>
  );
}

function FailureAction({
  action,
  onPress,
}: {
  readonly action: HarnessFailureAction;
  readonly onPress: () => void;
}): ReactNode {
  const label = HARNESS_FAILURE_ACTION_LABEL[action];
  return (
    <StripSwitch label={label} onPress={onPress}>
      <Text variant="footnote" tone="primary" numberOfLines={1}>
        {label}
      </Text>
    </StripSwitch>
  );
}

function quickBilling(
  billing: ChatBilling['kind'],
  weekly: WeeklyAllowance | null,
  cost: CostReadings,
): QuickBilling | null {
  if (billing === 'subscription-only') {
    return weekly === null
      ? { text: '—', label: 'Weekly allowance unavailable' }
      : { text: weekly.text, label: `Weekly allowance, ${weekly.text}` };
  }
  if (!cost.shown) return null;
  if (cost.quick === null) return { text: '—', label: 'Cost unavailable' };
  return { text: cost.quick, label: `Cost ${cost.quick}` };
}

function useStripNotice(chat: AiChatRow): {
  readonly notice: { readonly text: string; readonly warning: boolean } | null;
  readonly cancel: (() => void) | null;
  readonly failure: { readonly action: HarnessFailureAction; readonly onPress: () => void } | null;
} {
  const failure = useHarnessFailure(chat);
  const handlerOf = useFailureHandlers(chat);
  const execution = useExecutionLine(chat);
  const settled = machineSwitchOf(chat.pending_execution_target).kind === 'idle';
  if (!settled || failure === null) {
    return {
      notice: !settled || execution.warning ? execution : null,
      cancel: execution.cancel,
      failure: null,
    };
  }
  const { action, title } = failure;
  const onPress = action === null ? null : handlerOf(action);
  return {
    notice: { text: title, warning: true },
    cancel: execution.cancel,
    failure: action === null || onPress === null ? null : { action, onPress },
  };
}

function NoticeMark({
  text,
  warning,
}: {
  readonly text: string;
  readonly warning: boolean;
}): ReactNode {
  const tone = warning ? 'warning' : 'variant';
  return (
    <View
      accessible
      accessibilityLabel={text}
      pointerEvents="none"
      className="min-w-0 shrink flex-row items-center gap-1.5 px-1"
    >
      <Icon name={warning ? 'warning' : 'clock'} size={16} tone={tone} />
      <Text variant="footnote" tone={tone} className="min-w-0 shrink">
        {text}
      </Text>
    </View>
  );
}

function StatusToggle({
  expanded,
  onPress,
}: {
  readonly expanded: boolean;
  readonly onPress: () => void;
}): ReactNode {
  return (
    <Interactive
      label={expanded ? 'Hide chat activity' : 'Show chat activity'}
      expanded={expanded}
      controls={BOTTOM_AREA_ID}
      onPress={onPress}
      className="min-h-touch-min min-w-touch-min items-center justify-center rounded-sm"
      layerClassName="rounded-sm"
    >
      <Icon name={expanded ? 'chevronUp' : 'chevronDown'} size={16} tone="variant" />
    </Interactive>
  );
}

interface StripProps {
  readonly keyboardVisible?: boolean;
  readonly chat: AiChatRow;
  readonly blocked: boolean;
  readonly working: boolean;
}

function StripNotices({ chat }: { readonly chat: AiChatRow }): ReactNode {
  const { notice, cancel, failure } = useStripNotice(chat);
  if (notice === null && cancel === null && failure === null) return null;
  return (
    <View className="min-h-touch-min flex-row items-center">
      {notice === null ? null : <NoticeMark {...notice} />}
      {cancel === null ? null : (
        <StripSwitch label="Cancel machine switch" onPress={cancel}>
          <Text variant="footnote" tone="primary">
            Cancel
          </Text>
        </StripSwitch>
      )}
      {failure === null ? null : <FailureAction {...failure} />}
    </View>
  );
}

interface BottomPanels {
  readonly visibility: BottomVisibility;
  readonly columns: number;
  readonly minItemWidth: number;
  readonly selected: BottomReading | null;
  readonly onPanel: (panel: BottomPanel) => void;
  readonly onReading: (reading: BottomReading) => void;
  readonly onArea: () => void;
}

function useBottomPanels(width: number, keyboardVisible: boolean): BottomPanels {
  const [state, setState] = useState(INITIAL_BOTTOM_VISIBILITY);
  const [reading, setReading] = useState<BottomReading | null>(null);
  const compactHeight = useSizeClass().height === 'compact';
  const minItemWidth = compactHeight ? COMPACT_BOTTOM_GRID_MIN_WIDTH : BOTTOM_GRID.minItemWidth;
  const { gap, maxColumns } = BOTTOM_GRID;
  const { columns } = useGridLayout(width, minItemWidth, gap, maxColumns);
  const singleRow = compactHeight || columns === 1;
  const visibility = groupedBottomVisibility(state, columns, singleRow);
  const expanded = visibility.expanded && !keyboardVisible;
  const change = (
    next: BottomReading | null,
    update: (current: BottomVisibility) => BottomVisibility,
  ): void => {
    if (keyboardVisible) Keyboard.dismiss();
    setReading(next);
    setState(update);
  };
  return {
    visibility: { ...visibility, expanded },
    selected: expanded ? reading : null,
    columns,
    minItemWidth,
    onPanel: (panel): void => {
      change(null, (current) =>
        activatedPanel(
          keyboardVisible
            ? { ...current, expanded: false }
            : groupedBottomVisibility(current, columns, singleRow),
          panel,
          columns,
          singleRow,
        ),
      );
    },
    onReading: (next): void => {
      change(next, (current) => openedBottomReadings(current, keyboardVisible));
    },
    onArea: (): void => {
      change(null, (current) =>
        keyboardVisible && current.expanded ? current : toggledBottomArea(current, singleRow),
      );
    },
  };
}

function FooterShortcuts({
  chat,
  blocked,
  readings,
  indicators,
  panels,
  onLayout,
}: {
  readonly chat: AiChatRow;
  readonly blocked: boolean;
  readonly readings: StripReadings;
  readonly indicators: BottomActivity['indicators'];
  readonly panels: BottomPanels;
  readonly onLayout: (event: LayoutChangeEvent) => void;
}): ReactNode {
  const { visibility, selected, onPanel, onReading, onArea } = panels;
  return (
    <View className="px-gutter">
      <StripNotices chat={chat} />
      <View
        className="min-h-touch-min flex-row flex-wrap items-center justify-between"
        onLayout={onLayout}
      >
        <StatusWells indicators={indicators} visibility={visibility} onPress={onPanel} />
        <View className="ml-auto flex-row items-center">
          {compactShown(readings.percent) ? (
            <CompactChatButton chat={chat} blocked={blocked} />
          ) : null}
          <ReadingWells
            readings={readings}
            expanded={visibility.expanded}
            selected={selected}
            onPress={onReading}
          />
          <StatusToggle expanded={visibility.expanded} onPress={onArea} />
        </View>
      </View>
    </View>
  );
}

function ChatFooterStripBase(props: StripProps): ReactNode {
  const { chat, blocked, working, keyboardVisible = false } = props;
  const activity = useChatActivity(chat);
  const context = useContextUsage(chat);
  const cost = useCostReadings(chat, working);
  const billing = useChatBilling(chat);
  const weekly = useWeeklyAllowance(billing);
  const readings = {
    contextLabel: context.label,
    percent: context.percent,
    cache: cachePercent(chat),
    billing: quickBilling(billing.kind, weekly, cost),
  };
  const pane = useMeasuredWidth();
  const panels = useBottomPanels(pane.width, keyboardVisible);
  const { visibility, columns, minItemWidth, selected, onPanel } = panels;
  const usage = {
    chat,
    context,
    billing: billing.kind,
    weekly,
    selected,
    blocked: blocked || working,
    ...cost,
  };
  return (
    <View className="shrink-0">
      <FooterShortcuts
        chat={chat}
        blocked={blocked}
        readings={readings}
        indicators={activity.indicators}
        panels={panels}
        onLayout={pane.onLayout}
      />
      <ChatBottomArea
        activity={activity}
        {...visibility}
        onPanel={onPanel}
        columns={columns}
        minItemWidth={minItemWidth}
        paneWidth={pane.width}
        usage={usage}
      />
    </View>
  );
}

export const ChatFooterStrip = memo(ChatFooterStripBase);
