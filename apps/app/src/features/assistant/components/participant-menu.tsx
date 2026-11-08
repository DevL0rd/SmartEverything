import type { AssistantMessageRow } from '@smarteverything/domain';
import type { ReactNode, RefObject } from 'react';
import { useRef, useState } from 'react';
import { View, type GestureResponderEvent } from 'react-native';
import { router } from 'expo-router';
import { href } from '../../../app-shell/hrefs';
import { measureAnchor, pointRect, type Rect } from '../../../components/anchor';
import { Interactive } from '../../../components/interactive';
import { Menu, type MenuItem } from '../../../components/menu';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import type { EntityStore } from '../../../store/entity-store';
import { useEntityStore } from '../../../store/store-context';
import { selectAssistantName } from '../data/assistant-data';
import { quoteInto } from '../data/drafts';
import { lastMessageOf, participantChatId } from '../model/message-actions';
import { ME_ID, castOf, type Participant, type ParticipantKind } from '../model/participant';
import { INK_TEXT } from './chat-surface';
import { readableText } from '@smarteverything/domain/markdown';
import { mentionInto } from './message-actions';
import { SpeakerAvatar } from './speaker-avatar';

const KIND_CAPTION: Readonly<Record<ParticipantKind, string>> = {
  me: 'You',
  assistant: 'Assistant',
  helper: 'Helper',
  person: 'Person',
  plugin: 'Plugin',
  camera: 'Camera',
  schedule: 'Schedule',
};

export interface ParticipantMenu {
  readonly ref: RefObject<View | null>;
  readonly open: () => void;
  readonly openAt: (event: GestureResponderEvent) => void;
  readonly menu: ReactNode;
}

function lastRow(
  store: EntityStore,
  participant: Participant,
  chatId: string,
): AssistantMessageRow | null {
  const state = store.get();
  return lastMessageOf(
    Object.values(state.tables.assistant_messages.byId),
    chatId,
    participant.id,
    castOf(selectAssistantName(state), state.tables.ai_chats.byId[chatId] ?? null),
  );
}

function openItem(target: string | null, chatId: string): readonly MenuItem[] {
  if (target === null || target === chatId) return [];
  return [
    {
      id: 'open',
      label: 'Open chat',
      icon: 'messageCircle',
      onPress: (): void => {
        router.push(href.assistantChat(target));
      },
    },
  ];
}

function itemsOf(
  store: EntityStore,
  participant: Participant,
  chatId: string,
): readonly MenuItem[] {
  const open = openItem(participantChatId(participant.id), chatId);
  if (participant.id === ME_ID) return open;
  const row = lastRow(store, participant, chatId);
  const mention: MenuItem = {
    id: 'mention',
    label: 'Mention',
    icon: 'atSign',
    onPress: (): void => {
      mentionInto(chatId, participant.name);
    },
  };
  if (row === null) return [...open, mention];
  const quote: MenuItem = {
    id: 'quote',
    label: 'Quote their last message',
    icon: 'reply',
    onPress: (): void => {
      quoteInto(chatId, { messageId: row.id, who: participant.name, text: readableText(row.text) });
    },
  };
  return [...open, mention, quote];
}

export function ParticipantMenuHeader({
  participant,
}: {
  readonly participant: Participant;
}): ReactNode {
  return (
    <View className="flex-row items-center gap-2.5 px-2 pb-2 pt-2.5">
      <SpeakerAvatar participant={participant} live={false} />
      <View className="min-w-0 flex-1">
        <Text
          variant="label"
          numberOfLines={1}
          className={cn('min-w-0', INK_TEXT[participant.ink])}
        >
          {participant.name}
        </Text>
        <Text variant="caption" tone="faint" numberOfLines={1}>
          {KIND_CAPTION[participant.kind]}
        </Text>
      </View>
    </View>
  );
}

export function useParticipantMenu(participant: Participant, chatId: string): ParticipantMenu {
  const store = useEntityStore();
  const ref = useRef<View>(null);
  const [anchor, setAnchor] = useState<Rect | null>(null);
  return {
    ref,
    open: (): void => {
      measureAnchor(ref, setAnchor);
    },
    openAt: (event): void => {
      setAnchor(pointRect(event.nativeEvent.pageX, event.nativeEvent.pageY));
    },
    menu:
      anchor === null ? null : (
        <Menu
          items={itemsOf(store, participant, chatId)}
          options={{ header: () => <ParticipantMenuHeader participant={participant} /> }}
          anchor={anchor}
          label={participant.name}
          onClose={() => {
            setAnchor(null);
          }}
        />
      ),
  };
}

export function ParticipantTrigger({
  participant,
  chatId,
  className,
  children,
}: {
  readonly participant: Participant;
  readonly chatId: string;
  readonly className?: string;
  readonly children: ReactNode;
}): ReactNode {
  const { ref, open, menu } = useParticipantMenu(participant, chatId);
  return (
    <View ref={ref} collapsable={false} {...(className === undefined ? {} : { className })}>
      <Interactive
        label={participant.name}
        hint="Shows actions for this participant"
        onPress={open}
        hitSlop={4}
        layerClassName="rounded-sm"
      >
        {children}
      </Interactive>
      {menu}
    </View>
  );
}
