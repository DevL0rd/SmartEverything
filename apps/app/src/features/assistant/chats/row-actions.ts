import { router } from 'expo-router';
import { href } from '../../../app-shell/hrefs';
import type { MenuItem } from '../../../components/menu';
import type { SwipeAction } from '../../../components/swipe-row';
import type { ChatEntry } from './chat-entry';
import { deleteChat, setChatArchived, setChatPinned, setChatRead } from './chat-actions';

export type ChatRowTarget = Pick<ChatEntry, 'id' | 'title' | 'pinned' | 'archived' | 'unread'>;

export interface RowHandlers {
  readonly onDeleted: (chatId: string) => void;
}

function pinAction(entry: ChatRowTarget): SwipeAction {
  return {
    label: entry.pinned ? 'Unpin' : 'Pin',
    icon: entry.pinned ? 'pinOff' : 'pin',
    tone: 'primary',
    onCommit: (): void => {
      void setChatPinned(entry.id, !entry.pinned);
    },
  };
}

function archiveAction(entry: ChatRowTarget): SwipeAction {
  return {
    label: entry.archived ? 'Unarchive' : 'Archive',
    icon: entry.archived ? 'archiveRestore' : 'archive',
    tone: 'neutral',
    onCommit: (): void => {
      void setChatArchived(entry.id, !entry.archived);
    },
  };
}

export function swipeActionsOf(entry: ChatRowTarget): {
  readonly leading: SwipeAction | undefined;
  readonly trailing: SwipeAction;
} {
  return { leading: entry.archived ? undefined : pinAction(entry), trailing: archiveAction(entry) };
}

function toMenuItem(action: SwipeAction): MenuItem {
  return { label: action.label, icon: action.icon, onPress: action.onCommit };
}

export function menuOf(entry: ChatRowTarget, handlers: RowHandlers): readonly MenuItem[] {
  const { leading, trailing } = swipeActionsOf(entry);
  const unread = entry.unread > 0;
  return [
    ...(leading === undefined ? [] : [toMenuItem(leading)]),
    {
      label: unread ? 'Mark read' : 'Mark unread',
      icon: unread ? 'circleCheck' : 'circle',
      onPress: (): void => {
        void setChatRead(entry.id, unread);
      },
    },
    toMenuItem(trailing),
    {
      label: 'Chat info',
      icon: 'info',
      onPress: (): void => {
        router.push(href.assistantChat(entry.id, { sheet: 'chat' }));
      },
    },
    {
      label: 'Delete',
      icon: 'trash',
      destructive: true,
      onPress: (): void => {
        void deleteChat(entry).then((gone) => {
          if (gone) {
            handlers.onDeleted(entry.id);
          }
        });
      },
    },
  ];
}
