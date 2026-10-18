import type { ReactNode } from 'react';
import { confirm } from '../../../components/confirm-store';
import { ActionRow } from '../../../components/rows';
import { notify } from '../../../components/toast-store';
import { useActiveProfile } from '../../../store/people';
import { clearChatHistory } from './clear-history';
import { background } from '@smarteverything/logging';

async function clearFor(name: string): Promise<void> {
  const sure = await confirm({
    title: `Clear all chats for ${name}?`,
    body: `Every chat, message and attachment for ${name} is deleted. This can’t be undone.`,
    confirmLabel: 'Clear all chats',
    tone: 'destructive',
  });
  if (!sure) {
    return;
  }
  try {
    await clearChatHistory();
    notify({ message: 'Chat history cleared', tone: 'positive' });
  } catch (error) {
    notify({ message: 'Chat history was not cleared', error, tone: 'critical' });
  }
}

export function ClearHistoryRow(): ReactNode {
  const profile = useActiveProfile();
  return (
    <ActionRow
      title="Clear chat history"
      {...(profile === null ? {} : { subtitle: `Deletes every chat of ${profile.name}` })}
      icon="trash"
      destructive
      disabled={profile === null}
      onPress={() => {
        if (profile !== null) {
          background(clearFor(profile.name), 'for.clear_failed');
        }
      }}
    />
  );
}
