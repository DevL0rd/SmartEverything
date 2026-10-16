import type { ReactNode } from 'react';
import { mainPageSettings } from '../../../app-shell/main-pages';
import { View } from 'react-native';
import { useNavigation } from 'expo-router';
import type { AiChatRow, Engine } from '@smarteverything/domain';
import { useHeaderStatus } from '../../../components/header-status';
import { PageSettingsButton } from '../../../components/page-settings-button';
import { IconButton } from '../../../components/icon-button';
import { Icon } from '../../../components/icon';
import type { HeaderAction } from '../../../components/page-header';
import { useHeaderSlot } from '../../../components/screen-context';
import { Text } from '../../../components/text';
import { useSizeClass } from '../../../design/size-class';
import { CallPill, startCall } from '../call';
import { ProfileSwitcher } from '../../profiles';
import { ContextRing } from '../components/context-ring';
import { TypingDots } from '../components/typing-dots';
import { useAssistantName } from '../data/assistant-data';
import { useContextUsage } from '../data/context-usage';
import { sublineOf, waitingText, type Subline } from '../model/chat-subline';
import { useChatIdentity } from './chat-identity';
import { useChatModel } from './chat-model';

export interface PanelToggle {
  readonly open: boolean;
  readonly toggle: () => void;
}

function Back(): ReactNode {
  const navigation = useNavigation();
  return (
    <IconButton
      icon="arrowLeft"
      label="Back"
      onPress={() => {
        navigation.goBack();
      }}
    />
  );
}

function SublineText({
  line,
  contextLabel,
}: {
  readonly line: Subline;
  readonly contextLabel: string;
}): ReactNode {
  switch (line.kind) {
    case 'working':
      return (
        <View className="flex-row items-center gap-1.5">
          <Text variant="footnote" tone="primary" numberOfLines={1}>
            Working
          </Text>
          <TypingDots tone="primary" />
        </View>
      );
    case 'waiting':
      return (
        <View className="flex-row items-center gap-1">
          <Icon name="clock" size={16} tone="variant" />
          <Text variant="footnote" tone="variant" numberOfLines={1} className="shrink">
            {waitingText(line.count)}
          </Text>
        </View>
      );
    case 'plain':
      return (
        <View className="min-w-0 flex-row items-center gap-1">
          <Text variant="footnote" tone="variant" numberOfLines={1} className="shrink">
            {line.segments.join(' · ')}
          </Text>
          {line.context === null ? null : (
            <View className="shrink-0 flex-row items-center gap-1">
              <ContextRing percent={line.context} />
              <Text variant="footnote" tone="variant" numberOfLines={1} className="tabular">
                {`${contextLabel === 'Context' ? '' : `${contextLabel} `}${String(line.context)} %`}
              </Text>
            </View>
          )}
        </View>
      );
  }
}

function TitleText({
  title,
  line,
}: {
  readonly title: string;
  readonly line: ReactNode;
}): ReactNode {
  return (
    <View className="min-w-0 shrink justify-center">
      <View className="min-w-0 flex-row items-center gap-1">
        <Text
          variant="body-strong"
          numberOfLines={1}
          accessibilityRole="header"
          className="min-w-0 shrink"
        >
          {title}
        </Text>
      </View>
      <View className="min-w-0 flex-row items-center gap-0.5">
        <View className="shrink">{line}</View>
      </View>
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
        {back || leading.length > 0 ? null : <View className="w-3" />}
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

export interface ChatHeaderProps {
  readonly chat: AiChatRow;
  readonly working: boolean;
  readonly waiting: number;
  readonly back: boolean;
  readonly leading?: readonly HeaderAction[];
  readonly panel: PanelToggle | null;
}

function useSubline(
  chat: AiChatRow,
  working: boolean,
  waiting: number,
): readonly [Subline, string] {
  const identity = useChatIdentity(chat);
  const model = useChatModel(chat.engine);
  const compact = useSizeClass().width === 'compact';
  const context = useContextUsage(chat);
  return [
    sublineOf({
      working,
      waiting,
      lead: identity.lead,
      model: compact ? model.shortName : model.name,
      context: context.percent,
      compact,
    }),
    context.label,
  ];
}

export function ChatHeader({
  chat,
  working,
  waiting,
  back,
  leading = [],
  panel,
}: ChatHeaderProps): ReactNode {
  const [line, contextLabel] = useSubline(chat, working, waiting);
  return (
    <Frame
      back={back}
      leading={leading}
      title={
        <View className="min-w-0 flex-row items-center gap-1 px-1 py-1">
          <ProfileSwitcher compact />
          <TitleText
            title={chat.title}
            line={<SublineText line={line} contextLabel={contextLabel} />}
          />
        </View>
      }
      trailing={
        <>
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
        <View className="min-w-0 flex-row items-center gap-2.5 px-2 py-1">
          <ProfileSwitcher compact />
          <TitleText
            title="New chat"
            line={
              <Text variant="footnote" tone="variant" numberOfLines={1}>
                {compact ? model.shortName : model.name}
              </Text>
            }
          />
        </View>
      }
      trailing={<CallAction chatId={null} />}
    />
  );
}
