import type { ReactNode } from 'react';
import type { AiAgentRun } from '@smarteverything/domain';
import { isComputerEngine } from '../provider/computer-engine';
import { useIsOwner, useRow } from '../../../store/selectors';
import { Button } from '../../../components/button';
import { deleteChat } from '../chats/chat-actions';

export function AgentChatDelete({
  run,
  onDeleted,
}: {
  readonly run: AiAgentRun;
  readonly onDeleted: () => void;
}): ReactNode {
  const chat = useRow('ai_chats', run.child_chat_id ?? '');
  const owner = useIsOwner();
  if (chat === null || (isComputerEngine(chat.engine) && !owner)) return null;
  return (
    <Button
      label="Delete child chat"
      icon="trash"
      variant="destructive"
      onPress={() => {
        void deleteChat(chat).then((gone) => {
          if (gone) onDeleted();
        });
      }}
    />
  );
}
