import { turnsOfChat } from '../../../store/subscriptions';
import type { ReactNode } from 'react';
import { mainPageSettings } from '../../../app-shell/main-pages';
import { View } from 'react-native';
import { router } from 'expo-router';
import type { AiChatRow, AssistantMessageRow, Engine } from '@smarteverything/domain';
import { useHeaderStatus } from '../../../components/header-status';
import { PageSettingsButton } from '../../../components/page-settings-button';
import { IconButton } from '../../../components/icon-button';
import { Icon, type IconName } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import type { HeaderAction } from '../../../components/page-header';
import { useHeaderSlot } from '../../../components/screen-context';
import { Text } from '../../../components/text';
import type { Tone } from '../../../components/tone';
import { useSizeClass } from '../../../design/size-class';
import { useStoreSelector } from '../../../store/store-context';
import { liveTurnOf } from '../../../store/chat-turns';
import { useProfiles } from '../../../store/people';
import { CallPill, startCall } from '../call';
import { AssistantOrb } from '../call/orb';
import { ProfileSwitcher } from '../../profiles';
import { TypingDots } from '../components/typing-dots';
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
import { useChatModel } from './chat-model';
import { leaveChat } from './leave-chat';
import { SourceMark } from './source-mark';

interface PanelToggle {
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
        Working
      </Text>
      {line.step === null ? null : (
        <Text variant="footnote" tone="variant" numberOfLines={1} className="shrink">
          {`· ${line.step}`}
        </Text>
      )}
      <TypingDots tone="primary" />
    </View>
  );
}

function openDetails(): void {
  router.setParams({ sheet: 'chat' });
}

function TitleText({
  title,
  line,
}: {
  readonly title: string;
  readonly line: ReactNode;
}): ReactNode {
  return (
    <View role="heading" aria-level={1} className="min-w-0 shrink">
      <Interactive
        label={`${title}. Open chat details`}
        onPress={openDetails}
        className="min-h-touch-min min-w-0 justify-center rounded-md px-1"
        layerClassName="rounded-md"
      >
        <Text variant="title-3" numberOfLines={1} className="min-w-0 shrink">
          {title}
        </Text>
        {line}
      </Interactive>
    </View>
  );
}

function Frame({
  back,
  leading,
  title,
  trailing,
}: {
  readonly back: boolean;
  readonly leading: readonly HeaderAction[];
  readonly title: ReactNode;
  readonly trailing: ReactNode;
}): ReactNode {
  const slot = useHeaderSlot();
  const status = useHeaderStatus();
  if (slot === 'large') {
    return null;
  }
  return (
    <View className="z-10 border-b border-outline-variant bg-chrome/95 pt-safe">
      <View className="h-app-bar flex-row items-center gap-1 px-1">
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
        <PageSettingsButton settings={mainPageSettings('assistant')} />
      </View>
      <View className="items-start px-3">
        <CallPill />
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
}

function useLiveStep(chatId: string): string | null {
  return useStoreSelector(
    (state) => liveTurnOf(turnsOfChat(state, chatId), chatId)?.steps.at(-1) ?? null,
    undefined,
    [chatId],
  );
}

function useSubline(
  chat: AiChatRow,
  rows: readonly AssistantMessageRow[],
  working: boolean,
  waiting: number,
): Subline {
  const identity = useChatIdentity(chat);
  const step = useLiveStep(chat.id);
  const kind = feedbackKind(useTurnFeedback(chat, rows));
  return sublineOf({
    working,
    step,
    needsYou: kind === 'needs-you',
    waiting,
    queued: queuedCount(rows),
    switching: kind === 'switching',
    reconnecting: kind === 'reconnecting',
    failed: lastReplyFailed(rows),
    lead: identity.lead,
  });
}

export function ChatHeader({
  chat,
  rows,
  working,
  waiting,
  back,
  leading = [],
  panel,
}: ChatHeaderProps): ReactNode {
  const line = useSubline(chat, rows, working, waiting);
  return (
    <Frame
      back={back}
      leading={leading}
      title={
        <View className="min-w-0 flex-row items-center gap-2 py-1">
          <HeaderMark chat={chat} working={working} />
          <TitleText title={chat.title} line={<SublineText line={line} />} />
        </View>
      }
      trailing={
        <>
          <ProfileAction />
          <CallAction chatId={chat.id} />
          {panel !== null ? (
            <IconButton
              icon="panelRight"
              label="Browser"
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
