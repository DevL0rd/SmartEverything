import { router } from 'expo-router';
import type { AssistantMessageRow } from '@smarteverything/domain';
import { latestChatMessages, removeAiChat } from '../../../api/ai';
import { href } from '../../../app-shell/hrefs';
import { confirm } from '../../../components/confirm-store';
import type { MenuItem } from '../../../components/menu';
import type { SwipeAction } from '../../../components/swipe-row';
import { notify } from '../../../components/toast-store';
import { branchChat, latestBranchPoint } from './branch';
import type { ChatEntry } from './chat-entry';
import { deleteChat, setChatArchived, setChatPinned, setChatRead } from './chat-actions';
import { background } from '@smarteverything/logging';

export type ChatRowTarget = Pick<ChatEntry, 'id' | 'title' | 'pinned' | 'archived' | 'unread'>;

export interface RowHandlers {
  readonly onDeleted: (chatId: string) => void;
  readonly storedMessages: () => readonly AssistantMessageRow[];
}

function pinAction(entry: ChatRowTarget): SwipeAction {
  return {
    label: entry.pinned ? 'Unpin' : 'Pin',
    icon: entry.pinned ? 'pinOff' : 'pin',
    tone: 'primary',
    onCommit: (): void => {
      background(setChatPinned(entry.id, !entry.pinned), 'chat_pinned.set_failed');
    },
  };
}

function archiveAction(entry: ChatRowTarget): SwipeAction {
  return {
    label: entry.archived ? 'Unarchive' : 'Archive',
    icon: entry.archived ? 'archiveRestore' : 'archive',
    tone: 'neutral',
    onCommit: (): void => {
      setChatArchived(entry.id, !entry.archived);
    },
  };
}

function swipeActionsOf(entry: ChatRowTarget): {
  readonly leading: SwipeAction | undefined;
  readonly trailing: SwipeAction;
} {
  return { leading: entry.archived ? undefined : pinAction(entry), trailing: archiveAction(entry) };
}

export function rowSwipeOf(entry: ChatEntry): {
  readonly leading: SwipeAction | undefined;
  readonly trailing: SwipeAction | undefined;
} {
  return entry.desktop === undefined
    ? swipeActionsOf(entry)
    : { leading: undefined, trailing: undefined };
}

export function desktopMenuOf(open: () => void): readonly MenuItem[] {
  return [{ label: 'Open in app', icon: 'externalLink', onPress: open }];
}

function toMenuItem(action: SwipeAction): MenuItem {
  return { label: action.label, icon: action.icon, onPress: action.onCommit };
}

export async function resolveBranchPoint(
  chatId: string,
  stored: readonly AssistantMessageRow[],
): Promise<string | null> {
  return latestBranchPoint(stored) ?? latestBranchPoint(await latestChatMessages(chatId));
}

async function branchLatest(chatId: string, stored: readonly AssistantMessageRow[]): Promise<void> {
  try {
    const point = await resolveBranchPoint(chatId, stored);
    if (point === null) {
      notify({ message: 'Nothing to branch from yet' });
      return;
    }
    await branchChat(chatId, point);
  } catch (error) {
    notify({ message: 'Couldn’t branch the chat', error, tone: 'critical' });
  }
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
        background(setChatRead(entry.id, unread), 'chat_read.set_failed');
      },
    },
    {
      label: 'Rename',
      icon: 'pencil',
      onPress: (): void => {
        router.push(href.assistantChat(entry.id, { sheet: 'chat', operation: 'rename' }));
      },
    },
    {
      label: 'Branch from latest message',
      icon: 'gitBranch',
      onPress: (): void => {
        background(branchLatest(entry.id, handlers.storedMessages()), 'latest.branch_failed');
      },
    },
    toMenuItem(trailing),
    {
      label: 'Chat details',
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
        deleteChat(entry);
        handlers.onDeleted(entry.id);
      },
    },
  ];
}

export async function deleteInactiveAgents(entries: readonly ChatEntry[]): Promise<void> {
  const stale = entries.filter((entry) => entry.line.kind !== 'working');
  const count = String(stale.length);
  const sure = await confirm({
    title: `Delete ${count} inactive agent chats?`,
    body: 'Their messages and results are deleted. Running agents are kept.',
    confirmLabel: `Delete ${count} chats`,
    tone: 'destructive',
  });
  if (!sure) {
    return;
  }
  const results = await Promise.allSettled(stale.map((entry) => removeAiChat(entry.id)));
  const failed = results.filter((result) => result.status === 'rejected');
  if (failed.length > 0) {
    notify({
      message: `${String(failed.length)} of ${count} agent chats not deleted`,
      tone: 'critical',
    });
    return;
  }
  notify({ message: `${count} inactive agent chats deleted` });
}
