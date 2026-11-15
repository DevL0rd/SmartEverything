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
import type { PageSettingsLink } from '../../../components/page-settings-button';
import { PageShell } from '../../../components/page-shell/page-shell';
import type { ShellAction } from '../../../components/page-shell/shell-actions';
import { IconButton } from '../../../components/icon-button';
import { Icon, type IconName } from '../../../components/icon';
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

function ChatPane({
  title,
  back,
  leading,
  heading,
  trailing,
  banner,
  settings,
  children,
}: {
  readonly title: string;
  readonly back: boolean;
  readonly leading: readonly ShellAction[];
  readonly heading: ReactNode;
  readonly trailing: ReactNode;
  readonly banner?: ReactNode;
  readonly settings?: PageSettingsLink;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <PageShell
      variant="pane"
      title={title}
      back={back}
      {...(back ? { onBack: leaveChat } : {})}
      leading={leading}
      heading={heading}
      trailing={trailing}
      {...(banner === undefined ? {} : { banner })}
      {...(settings === undefined ? {} : { settings })}
    >
      {children}
    </PageShell>
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

export interface ChatShellProps {
  readonly chat: AiChatRow;
  readonly rows: readonly AssistantMessageRow[];
  readonly working: boolean;
  readonly waiting: number;
  readonly back: boolean;
  readonly leading?: readonly ShellAction[];
  readonly panel: PanelToggle | null;
  readonly ref?: Ref<View>;
  readonly children: ReactNode;
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

export function ChatShell({
  chat,
  rows,
  working,
  waiting,
  back,
  leading = [],
  panel,
  ref,
  children,
}: ChatShellProps): ReactNode {
  const line = useSubline(chat, rows, waiting);
  return (
    <ChatPane
      title={chat.title}
      back={back}
      leading={leading}
      heading={
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
          <ChatHeaderMenu chatId={chat.id} />
        </>
      }
    >
      {children}
    </ChatPane>
  );
}

export function ChatHistoryShell({
  title,
  back,
  leading,
  banner,
  children,
}: {
  readonly title: string;
  readonly back: boolean;
  readonly leading: readonly ShellAction[];
  readonly banner: ReactNode;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <ChatPane
      title={title}
      back={back}
      leading={leading}
      heading={
        <Text variant="title-3" numberOfLines={1} role="heading" aria-level={1}>
          {title}
        </Text>
      }
      trailing={null}
      banner={banner}
    >
      {children}
    </ChatPane>
  );
}

export function DraftShell({
  engine,
  back,
  leading = [],
  children,
}: {
  readonly engine: Engine;
  readonly back: boolean;
  readonly leading?: readonly ShellAction[];
  readonly children: ReactNode;
}): ReactNode {
  const model = useChatModel(engine);
  const compact = useSizeClass().width === 'compact';
  return (
    <ChatPane
      title="New chat"
      back={back}
      leading={leading}
      settings={mainPageSettings('assistant')}
      heading={
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
    >
      {children}
    </ChatPane>
  );
}
