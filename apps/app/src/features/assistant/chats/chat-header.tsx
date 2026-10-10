import type { ReactNode } from 'react';
import { useState } from 'react';
import type { AiChatRow } from '@smarteverything/domain';
import type { MenuItem } from '../../../components/menu';
import { PageHeader, type HeaderAction } from '../../../components/page-header';
import { TextEditSheet, type TextEditRequest } from '../../../settings/text-edit-sheet';
import { CallPill, startCall } from '../call';
import { changeChat, stopChat } from './chat-actions';
import { chatMenuOf, renameRequest } from './chat-menu';

function callAction(chatId: string): HeaderAction {
  return {
    icon: 'phone',
    label: 'Call',
    iconOnly: true,
    onPress: (): void => {
      startCall({ source: 'chat', chatId });
    },
  };
}

function overflowOf(
  chat: AiChatRow,
  working: boolean,
  rename: () => void,
  onDeleted: () => void,
): readonly MenuItem[] {
  return [
    ...(working
      ? [
          {
            label: 'Stop',
            icon: 'square' as const,
            onPress: (): void => {
              void stopChat(chat.id);
            },
          },
        ]
      : []),
    ...chatMenuOf(chat, rename, onDeleted),
    {
      label: 'Archive',
      icon: 'box',
      onPress: (): void => {
        void changeChat(chat.id, { archived: true });
      },
    },
  ];
}

export interface ChatHeaderProps {
  readonly chat: AiChatRow;
  readonly working: boolean;
  readonly back: boolean;
  readonly onDetails: () => void;
  readonly onDeleted: () => void;
  readonly leading?: readonly HeaderAction[];
}

export function ChatHeader({
  chat,
  working,
  back,
  onDetails,
  onDeleted,
  leading = [],
}: ChatHeaderProps): ReactNode {
  const [renaming, setRenaming] = useState<TextEditRequest | null>(null);
  const details: HeaderAction = {
    icon: 'info',
    label: 'Details',
    iconOnly: true,
    onPress: onDetails,
  };
  return (
    <>
      <PageHeader
        title={chat.title}
        back={back}
        search={false}
        onTitlePress={onDetails}
        actions={[...leading, callAction(chat.id), details]}
        overflow={overflowOf(
          chat,
          working,
          () => {
            setRenaming(renameRequest(chat));
          },
          onDeleted,
        )}
        below={<CallPill />}
      />
      <TextEditSheet
        request={renaming}
        onClose={() => {
          setRenaming(null);
        }}
      />
    </>
  );
}
