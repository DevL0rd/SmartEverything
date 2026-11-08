import { turnsOfChat } from '../../../store/subscriptions';
import type { ReactNode, Ref } from 'react';
import { mainPageSettings } from '../../../app-shell/main-pages';
import { View } from 'react-native';
import {
  helperDialogueOf,
  type AiChatRow,
  type AssistantMessageRow,
  type Engine,
} from '@smarteverything/domain';
import { useHeaderStatus } from '../../../components/header-status';
import { PageSettingsButton } from '../../../components/page-settings-button';
import { IconButton } from '../../../components/icon-button';
import { Icon, type IconName } from '../../../components/icon';
import type { HeaderAction } from '../../../components/page-header';
import { useHeaderSlot } from '../../../components/screen-context';
import { Text } from '../../../components/text';
import type { Tone } from '../../../components/tone';
import { useSizeClass } from '../../../design/size-class';
import { useStoreSelector } from '../../../store/store-context';
import { workStatusOf, workingTurnOf, type WorkStatus } from '../../../store/chat-turns';
import { useProfiles } from '../../../store/people';
import { startCall } from '../call';
import { AssistantOrb } from '../call/orb';
import { ProfileSwitcher } from '../../profiles';
import { TypingDots } from '../components/typing-dots';
import { useAgentActivity } from '../data/agent-runs';
import { useAssistantName } from '../data/assistant-data';
import { useTurnFeedback } from '../data/turn-feedback';
import {
  lastReplyFailed,
  queuedCount,
  sublineOf,
  sublineText,
  type Subline,
} from '../model/chat-subline';
import { feedbackKind } from '../model/turn-feedback';
import { useChatIdentity } from './chat-identity';
import { ChatHeaderMenu } from './chat-header-menu';
import { ChatMachineControl } from './chat-machine-control';
import { useChatModel } from './chat-model';
import { leaveChat } from './leave-chat';
import { SourceMark } from './source-mark';

interface PanelToggle {
  readonly docked: boolean;
  readonly open: boolean;
  readonly toggle: () => void;
}

const MARK_SIZE = 32;

const SUBLINE_ICON: Readonly<
  Record<'needs-you' | 'waiting' | 'queued' | 'switching' | 'reconnecting' | 'failed', IconName>
> = {
  'needs-you': 'warning',
  waiting: 'clock',
  queued: 'layers',
  switching: 'refresh',
  reconnecting: 'wifiOff',
  failed: 'circleX',
};

const SUBLINE_TONE: Readonly<
  Record<'needs-you' | 'waiting' | 'queued' | 'switching' | 'reconnecting' | 'failed', Tone>
> = {
  'needs-you': 'warning',
  waiting: 'variant',
  queued: 'variant',
  switching: 'variant',
  reconnecting: 'critical',
  failed: 'critical',
};

function Back(): ReactNode {
  return <IconButton icon="arrowLeft" label="Back" onPress={leaveChat} />;
}

type StatusLineKind = keyof typeof SUBLINE_ICON;

function StatusLine({
  line,
}: {
  readonly line: Extract<Subline, { readonly kind: StatusLineKind }>;
}): ReactNode {
  return (
    <View className="min-w-0 flex-row items-center gap-1">
      <Icon name={SUBLINE_ICON[line.kind]} size={16} tone={SUBLINE_TONE[line.kind]} />
      <Text variant="footnote" tone="variant" numberOfLines={1} className="shrink">
        {sublineText(line)}
      </Text>
    </View>
  );
}

function SublineText({ line }: { readonly line: Subline }): ReactNode {
  if (line.kind === 'none') return null;
  if (line.kind === 'lead') {
    return (
      <Text variant="footnote" tone="variant" numberOfLines={1}>
        {line.text}
      </Text>
    );
  }
  if (line.kind !== 'working') return <StatusLine line={line} />;
  return (
    <View className="min-w-0 flex-row items-center gap-1.5">
      <Text variant="footnote" tone="primary" numberOfLines={1} className="shrink-0">
        {line.work.phase}
      </Text>
      {line.work.step === null ? null : (
        <Text variant="footnote" tone="variant" numberOfLines={1} className="shrink">
          {`· ${line.work.step}`}
        </Text>
      )}
      <TypingDots tone="primary" />
    </View>
  );
}

function TitleText({
  title,
  line,
}: {
  readonly title: string;
  readonly line: ReactNode;
}): ReactNode {
  return (
    <View className="min-h-touch-min min-w-0 shrink justify-center px-1">
      <Text
        role="heading"
        aria-level={1}
        variant="title-3"
        numberOfLines={1}
        className="min-w-0 shrink"
      >
        {title}
      </Text>
      {line}
    </View>
  );
}

function Frame({
  back,
  leading,
  title,
  trailing,
  menu,
}: {
  readonly back: boolean;
  readonly leading: readonly HeaderAction[];
  readonly title: ReactNode;
  readonly trailing: ReactNode;
  readonly menu: ReactNode;
}): ReactNode {
  const slot = useHeaderSlot();
  const status = useHeaderStatus();
  if (slot === 'large') {
    return null;
  }
  return (
    <View className="z-10 border-b border-outline-variant bg-chrome/95 pt-safe">
      <View className="min-h-14 flex-row items-center gap-1 px-1">
        {back ? <Back /> : null}
        {leading.map((action) => (
          <IconButton
            key={action.label}
            icon={action.icon}
            label={action.label}
            selected={action.selected ?? false}
            {...(action.onPress === undefined ? {} : { onPress: action.onPress })}
          />
        ))}
        {back || leading.length > 0 ? null : <View className="w-2" />}
        <View className="min-w-0 flex-1">{title}</View>
        {status}
        {trailing}
        {menu}
      </View>
    </View>
  );
}

function ProfileAction(): ReactNode {
  return useProfiles().length > 1 ? <ProfileSwitcher compact /> : null;
}

function CallAction({ chatId }: { readonly chatId: string | null }): ReactNode {
  const name = useAssistantName();
  return (
    <IconButton
      icon="phone"
      label={`Call ${name}`}
      onPress={() => {
        startCall(chatId === null ? { source: 'chat' } : { source: 'chat', chatId });
      }}
    />
  );
}

function HeaderMark({
  chat,
  working,
}: {
  readonly chat: AiChatRow;
  readonly working: boolean;
}): ReactNode {
  const { source } = useChatIdentity(chat);
  if (source.kind === 'app' || source.kind === 'branch') {
    return (
      <View aria-hidden className="size-8 items-center justify-center">
        <AssistantOrb state={working ? 'thinking' : 'idle'} size={MARK_SIZE} />
      </View>
    );
  }
  return <SourceMark source={source} size={28} />;
}

export interface ChatHeaderProps {
  readonly chat: AiChatRow;
  readonly rows: readonly AssistantMessageRow[];
  readonly working: boolean;
  readonly waiting: number;
  readonly back: boolean;
  readonly leading?: readonly HeaderAction[];
  readonly panel: PanelToggle | null;
  readonly ref?: Ref<View>;
}

function sameWork(left: WorkStatus | null, right: WorkStatus | null): boolean {
  return left === right || (left?.phase === right?.phase && left?.step === right?.step);
}

function useLiveWork(chatId: string): WorkStatus | null {
  return useStoreSelector(
    (state) => {
      const turn = workingTurnOf(turnsOfChat(state, chatId), chatId);
      return turn === null ? null : workStatusOf(turn);
    },
    sameWork,
    [chatId],
  );
}

function useSubline(
  chat: AiChatRow,
  rows: readonly AssistantMessageRow[],
  waiting: number,
): Subline {
  const identity = useChatIdentity(chat);
  const live = useLiveWork(chat.id);
  const activity = useAgentActivity(chat.kind === 'subagent' ? chat.parent_id : null, chat.id);
  const kind = feedbackKind(useTurnFeedback(chat, rows));
  const coordinatorRows = rows.filter((row) => helperDialogueOf(row) === undefined);
  return sublineOf({
    work: activity === null ? live : { phase: 'Working', step: activity },
    needsYou: kind === 'needs-you',
    waiting,
    queued: queuedCount(coordinatorRows),
    switching: kind === 'switching',
    reconnecting: kind === 'reconnecting',
    failed: lastReplyFailed(coordinatorRows),
    lead: identity.lead,
  });
}

function browserToggleLabel(panel: PanelToggle): string {
  if (!panel.open) return 'Browser';
  return panel.docked ? 'Close browser' : 'Back to chat';
}

export function ChatHeader({
  chat,
  rows,
  working,
  waiting,
  back,
  leading = [],
  panel,
  ref,
}: ChatHeaderProps): ReactNode {
  const line = useSubline(chat, rows, waiting);
  return (
    <Frame
      back={back}
      leading={leading}
      menu={<ChatHeaderMenu chatId={chat.id} />}
      title={
        <View className="min-w-0 flex-row items-center gap-2 py-1">
          <HeaderMark chat={chat} working={working} />
          <TitleText title={chat.title} line={<SublineText line={line} />} />
        </View>
      }
      trailing={
        <>
          <ProfileAction />
          <ChatMachineControl key={chat.id} chat={chat} />
          <CallAction chatId={chat.id} />
          {panel !== null ? (
            <IconButton
              {...(ref === undefined ? {} : { ref })}
              icon={panel.open ? 'close' : 'panelRight'}
              label={browserToggleLabel(panel)}
              shortcut="Ctrl I"
              selected={panel.open}
              onPress={panel.toggle}
            />
          ) : null}
        </>
      }
    />
  );
}

export function ChatHistoryHeader({
  title,
  back,
  leading,
}: {
  readonly title: string;
  readonly back: boolean;
  readonly leading: readonly HeaderAction[];
}): ReactNode {
  return (
    <Frame
      back={back}
      leading={leading}
      trailing={null}
      menu={null}
      title={
        <Text variant="title-3" numberOfLines={1} role="heading" aria-level={1} className="px-1">
          {title}
        </Text>
      }
    />
  );
}

export function DraftHeader({
  engine,
  back,
  leading = [],
}: {
  readonly engine: Engine;
  readonly back: boolean;
  readonly leading?: readonly HeaderAction[];
}): ReactNode {
  const model = useChatModel(engine);
  const compact = useSizeClass().width === 'compact';
  return (
    <Frame
      back={back}
      leading={leading}
      menu={<PageSettingsButton settings={mainPageSettings('assistant')} />}
      title={
        <View className="min-w-0 flex-row items-center gap-2 py-1">
          <View aria-hidden className="size-8 items-center justify-center">
            <AssistantOrb state="idle" size={MARK_SIZE} />
          </View>
          <View className="min-w-0 shrink px-1">
            <Text variant="title-3" numberOfLines={1} role="heading" aria-level={1}>
              New chat
            </Text>
            <Text variant="footnote" tone="variant" numberOfLines={1}>
              {compact ? model.shortName : model.name}
            </Text>
          </View>
        </View>
      }
      trailing={
        <>
          <ProfileAction />
          <CallAction chatId={null} />
        </>
      }
    />
  );
}
