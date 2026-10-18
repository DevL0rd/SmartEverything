import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { AiChatRow, AssistantMessageRow } from '@smarteverything/domain';
import { Icon } from '../../../components/icon';
import { IconButton } from '../../../components/icon-button';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { useIdiom } from '../../../design/platform';
import { useIsOwner } from '../../../store/selectors';
import { branchChat, latestBranchPoint } from '../chats/branch';
import { deleteChat, setChatArchived, setChatPinned, setChatRead } from '../chats/chat-actions';
import { chatActionsOf, hasIncoming, type ChatAction } from '../model/chat-actions';
import { isComputerEngine } from '../provider/computer-engine';
import { useDetailsClose, useDetailsDeleted } from './details-scope';
import { background } from '@smarteverything/logging';

interface Handlers {
  readonly close: () => void;
  readonly onDeleted: () => void;
}

function run(
  id: ChatAction['id'],
  chat: AiChatRow,
  rows: readonly AssistantMessageRow[],
  on: Handlers,
): void {
  switch (id) {
    case 'pin':
      background(setChatPinned(chat.id, !chat.pinned), 'chat_pinned.set_failed');
      return;
    case 'read':
      background(setChatRead(chat.id, chat.unread_count > 0), 'chat_read.set_failed');
      return;
    case 'branch': {
      const point = latestBranchPoint(rows);
      on.close();
      if (point !== null) background(branchChat(chat.id, point), 'chat.branch_failed');
      return;
    }
    case 'archive':
      on.close();
      setChatArchived(chat.id, chat.archived_at === null);
      return;
    case 'delete':
      deleteChat(chat);
      on.close();
      on.onDeleted();
  }
}

function LabelledButton({
  action,
  onPress,
}: {
  readonly action: ChatAction;
  readonly onPress: () => void;
}): ReactNode {
  const tone = action.destructive ? 'critical' : 'variant';
  return (
    <Interactive
      label={action.label}
      disabled={!action.enabled}
      onPress={onPress}
      className="w-16 min-h-touch-min items-center gap-1 rounded-lg py-1"
      layerClassName="rounded-lg"
    >
      <View
        className={cn(
          'size-12 items-center justify-center rounded-full',
          action.destructive ? 'bg-critical/14' : 'bg-surface-3',
        )}
      >
        <Icon name={action.icon} size={20} tone={tone} />
      </View>
      <Text variant="caption" tone={tone} numberOfLines={1}>
        {action.label}
      </Text>
    </Interactive>
  );
}

export function QuickActions({
  chat,
  rows,
}: {
  readonly chat: AiChatRow;
  readonly rows: readonly AssistantMessageRow[];
}): ReactNode {
  const touch = useIdiom() === 'touch';
  const owner = useIsOwner();
  const on: Handlers = { close: useDetailsClose(), onDeleted: useDetailsDeleted() };
  const readOnly = isComputerEngine(chat.engine) && !owner;
  const actions = chatActionsOf(chat, {
    incoming: hasIncoming(rows),
    branchPoint: latestBranchPoint(rows) !== null,
  });
  return (
    <View className="flex-row items-start gap-1 px-3 pb-2 pt-1">
      {actions.map((action) => {
        const shown =
          readOnly && (action.id === 'branch' || action.id === 'delete')
            ? { ...action, enabled: false }
            : action;
        const press = (): void => {
          run(action.id, chat, rows, on);
        };
        return touch ? (
          <LabelledButton key={action.id} action={shown} onPress={press} />
        ) : (
          <IconButton
            key={action.id}
            icon={shown.icon}
            label={shown.label}
            disabled={!shown.enabled}
            {...(shown.destructive ? { tone: 'critical' as const } : {})}
            onPress={press}
          />
        );
      })}
    </View>
  );
}
