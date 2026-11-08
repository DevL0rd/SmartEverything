import type { AiChatRow } from '@smarteverything/domain';
import type { IconName } from '../../../components/icon';

type ChatActionId = 'pin' | 'read' | 'archive' | 'delete';

export interface ChatAction {
  readonly id: ChatActionId;
  readonly label: string;
  readonly icon: IconName;
  readonly destructive: boolean;
  readonly enabled: boolean;
}

export function chatActionsOf(
  chat: Pick<AiChatRow, 'pinned' | 'archived_at' | 'unread_count'>,
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
      enabled: true,
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
