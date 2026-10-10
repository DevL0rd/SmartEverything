import { messageSpeaker, type AiChatRow, type AssistantMessageRow } from '@smarteverything/domain';
import type { IconName } from '../../../components/icon';

export type ChatActionId = 'pin' | 'read' | 'branch' | 'archive' | 'delete';

export interface ChatAction {
  readonly id: ChatActionId;
  readonly label: string;
  readonly icon: IconName;
  readonly destructive: boolean;
  readonly enabled: boolean;
}

export function hasIncoming(rows: readonly AssistantMessageRow[]): boolean {
  return rows.some((row) => {
    const kind = messageSpeaker(row).kind;
    return kind === 'ai' || kind === 'person';
  });
}

export function chatActionsOf(
  chat: Pick<AiChatRow, 'pinned' | 'archived_at' | 'unread_count'>,
  context: { readonly incoming: boolean; readonly branchPoint: boolean },
): readonly ChatAction[] {
  const unread = chat.unread_count > 0;
  const archived = chat.archived_at !== null;
  return [
    {
      id: 'pin',
      label: chat.pinned ? 'Unpin' : 'Pin',
      icon: chat.pinned ? 'pinOff' : 'pin',
      destructive: false,
      enabled: true,
    },
    {
      id: 'read',
      label: unread ? 'Mark read' : 'Mark unread',
      icon: unread ? 'circleCheck' : 'circle',
      destructive: false,
      enabled: unread || context.incoming,
    },
    {
      id: 'branch',
      label: 'Branch',
      icon: 'gitBranch',
      destructive: false,
      enabled: context.branchPoint,
    },
    {
      id: 'archive',
      label: archived ? 'Unarchive' : 'Archive',
      icon: archived ? 'archiveRestore' : 'archive',
      destructive: false,
      enabled: true,
    },
    { id: 'delete', label: 'Delete', icon: 'trash', destructive: true, enabled: true },
  ];
}
