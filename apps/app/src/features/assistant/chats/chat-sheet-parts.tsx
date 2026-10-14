import { isComputerEngine } from '../provider/computer-engine';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { TextInput, View } from 'react-native';
import type { AiChatRow, AssistantMessageRow } from '@smarteverything/domain';
import { AI_CHAT_TITLE_MAX } from '@smarteverything/domain';
import { Icon } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { useFocusOnMount } from '../../../components/use-focus-on-mount';
import { cn } from '../../../design/cn';
import { useIsOwner } from '../../../store/selectors';
import { useMinute } from '../../../store/clock';
import { useStoreSelector } from '../../../store/store-context';
import { moment } from '../../../format/time';
import { chatActionsOf, hasIncoming, type ChatAction } from '../model/chat-actions';
import { branchChat, latestBranchPoint } from './branch';
import {
  changeChat,
  deleteChat,
  setChatArchived,
  setChatPinned,
  setChatRead,
} from './chat-actions';
import { useChatIdentity } from './chat-identity';
import { SourceMark } from './source-mark';

function QuickButton({
  action,
  onPress,
}: {
  readonly action: ChatAction;
  readonly onPress: () => void;
}): ReactNode {
  return (
    <Interactive
      label={action.label}
      disabled={!action.enabled}
      onPress={onPress}
      className="min-h-touch-min items-center gap-1 rounded-lg px-1 py-1"
      layerClassName="rounded-lg"
    >
      <View
        className={cn(
          'size-12 items-center justify-center rounded-full',
          action.destructive ? 'bg-critical/14' : 'bg-surface-3',
        )}
      >
        <Icon name={action.icon} size={20} tone={action.destructive ? 'critical' : 'variant'} />
      </View>
      <Text variant="caption" tone={action.destructive ? 'critical' : 'variant'} numberOfLines={1}>
        {action.label}
      </Text>
    </Interactive>
  );
}

export interface QuickActionsProps {
  readonly chat: AiChatRow;
  readonly rows: readonly AssistantMessageRow[];
  readonly onDeleted: () => void;
  readonly onClose: () => void;
}

function runAction(id: ChatAction['id'], props: QuickActionsProps): void {
  const { chat, rows, onDeleted, onClose } = props;
  switch (id) {
    case 'pin':
      void setChatPinned(chat.id, !chat.pinned);
      return;
    case 'read':
      void setChatRead(chat.id, chat.unread_count > 0);
      return;
    case 'branch': {
      const point = latestBranchPoint(rows);
      onClose();
      if (point !== null) {
        void branchChat(chat.id, point);
      }
      return;
    }
    case 'archive':
      onClose();
      void setChatArchived(chat.id, chat.archived_at === null);
      return;
    case 'delete':
      void deleteChat(chat).then((gone) => {
        if (gone) {
          onClose();
          onDeleted();
        }
      });
  }
}

export function QuickActions(props: QuickActionsProps): ReactNode {
  const { chat, rows } = props;
  const owner = useIsOwner();
  const readOnly = isComputerEngine(chat.engine) && !owner;
  const actions = chatActionsOf(chat, {
    incoming: hasIncoming(rows),
    branchPoint: latestBranchPoint(rows) !== null,
  });
  return (
    <View className="flex-row items-start border-t border-outline-variant pt-3">
      {actions.map((action) => (
        <View key={action.id} className="flex-1 items-center">
          <QuickButton
            action={
              readOnly && (action.id === 'branch' || action.id === 'delete')
                ? { ...action, enabled: false }
                : action
            }
            onPress={() => {
              runAction(action.id, props);
            }}
          />
        </View>
      ))}
    </View>
  );
}

function TitleInput({
  value,
  onChange,
  onSave,
  onCancel,
}: {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly onSave: () => void;
  readonly onCancel: () => void;
}): ReactNode {
  const input = useFocusOnMount(true);
  return (
    <TextInput
      ref={input}
      value={value}
      onChangeText={onChange}
      onSubmitEditing={onSave}
      onBlur={onSave}
      onKeyPress={(event) => {
        if (event.nativeEvent.key === 'Escape') {
          onCancel();
        }
      }}
      maxLength={AI_CHAT_TITLE_MAX}
      selectTextOnFocus
      accessibilityLabel="Chat name"
      cursorColorClassName="accent-primary"
      selectionColorClassName="accent-primary"
      className="min-h-touch-min rounded-md border border-primary bg-surface-2 px-3 font-sans-semibold text-title-3 text-on-surface outline-none"
    />
  );
}

function InlineTitle({ chat }: { readonly chat: AiChatRow }): ReactNode {
  const [draft, setDraft] = useState<string | null>(null);
  const cancel = (): void => {
    setDraft(null);
  };
  const save = (): void => {
    const next = draft?.trim() ?? '';
    setDraft(null);
    if (next !== '' && next !== chat.title) {
      void changeChat(chat.id, { title: next });
    }
  };
  if (draft === null) {
    return (
      <Interactive
        label={`${chat.title}. Rename`}
        onPress={() => {
          setDraft(chat.title);
        }}
        className="min-h-touch-min flex-row items-center gap-2 self-start rounded-md"
        layerClassName="rounded-md"
      >
        <Text variant="title-2" numberOfLines={2} className="shrink">
          {chat.title}
        </Text>
        <Icon name="pencil" size={16} tone="faint" />
      </Interactive>
    );
  }
  return <TitleInput value={draft} onChange={setDraft} onSave={save} onCancel={cancel} />;
}

function startedText(
  chat: AiChatRow,
  lead: string | null,
  now: number,
  zone: string | null,
): string {
  const parts = [
    lead ?? 'App chat',
    `started ${moment(chat.created_at, now, zone)}`,
    chat.pinned ? 'pinned' : null,
    chat.archived_at === null ? null : 'archived',
  ];
  return parts.filter((part) => part !== null).join(' · ');
}

export function SheetHeading({ chat }: { readonly chat: AiChatRow }): ReactNode {
  const identity = useChatIdentity(chat);
  const now = useMinute();
  const zone = useStoreSelector((state) => state.settings?.time_zone ?? null);
  return (
    <View className="flex-row items-center gap-4 pb-3">
      <SourceMark source={identity.source} size={40} />
      <View className="min-w-0 flex-1">
        <InlineTitle chat={chat} />
        <Text variant="footnote" tone="variant" numberOfLines={2}>
          {startedText(chat, identity.lead, now, zone)}
        </Text>
      </View>
    </View>
  );
}
