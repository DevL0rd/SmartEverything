import { router } from 'expo-router';
import type { AssistantMessageRow } from '@smarteverything/domain';
import { latestChatMessages, removeAiChat } from '../../../api/ai';
import { href } from '../../../app-shell/hrefs';
import { confirm } from '../../../components/confirm-store';
import { plural } from '../../../format/text';
import type { MenuItem } from '../../../components/menu';
import type { SwipeAction } from '../../../components/swipe-row';
import { notify } from '../../../components/toast-store';
import { branchChat, latestBranchPoint } from './branch';
import { completedHelpersOf, type ChatEntry } from './chat-entry';
import { deleteChat, setChatArchived, setChatPinned, setChatRead } from './chat-actions';
import { closeChatListSlideOver } from './chat-list-toggle';
import { Logger, background } from '@smarteverything/logging';

const log = new Logger('app.chat-rows');

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

export function rowSwipeOf(entry: ChatRowTarget): {
  readonly leading: SwipeAction | undefined;
  readonly trailing: SwipeAction;
} {
  return { leading: entry.archived ? undefined : pinAction(entry), trailing: archiveAction(entry) };
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

function openRename(entry: ChatRowTarget): void {
  closeChatListSlideOver();
  router.push(href.assistantChat(entry.id, { operation: 'rename' }));
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
  const { leading, trailing } = rowSwipeOf(entry);
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
        openRename(entry);
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

function childFirst(entries: readonly ChatEntry[]): readonly ChatEntry[] {
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const depth = (entry: ChatEntry): number => {
    let level = 0;
    let parent = entry.parentId;
    while (parent !== null) {
      const found = byId.get(parent);
      if (found === undefined) break;
      level += 1;
      parent = found.parentId;
    }
    return level;
  };
  return [...entries].sort((left, right) => depth(right) - depth(left));
}

export async function deleteInactiveAgents(
  entries: readonly ChatEntry[],
  onDeleted: (chatId: string) => void,
): Promise<void> {
  const stale = completedHelpersOf(entries);
  if (stale.length === 0) return;
  const chats = plural(stale.length, 'completed helper chat');
  const sure = await confirm({
    title: `Delete ${chats}?`,
    body: 'Their messages and results are deleted. Running agents are kept.',
    confirmLabel: `Delete ${plural(stale.length, 'chat')}`,
    tone: 'destructive',
  });
  if (!sure) {
    return;
  }
  let failed = 0;
  for (const entry of childFirst(stale)) {
    try {
      await removeAiChat(entry.id, { inactiveHelper: true });
      onDeleted(entry.id);
    } catch (error) {
      failed += 1;
      log.warn('inactive_agent.kept', { chatId: entry.id, error });
    }
  }
  if (failed > 0) {
    notify({
      message: `${String(failed)} of ${chats} kept`,
      tone: 'critical',
    });
    return;
  }
  notify({ message: `${chats} deleted` });
}
