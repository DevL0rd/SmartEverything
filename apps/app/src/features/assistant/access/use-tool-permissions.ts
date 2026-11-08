import { useState } from 'react';
import { useIsOwner } from '../../../store/selectors';
import { useMutationState } from '../../../store/mutation';
import { changeChat } from '../chats/chat-actions';
import { allowedOf, stored } from './tools-model';
import { isComputerEngine } from '../provider/computer-engine';
import type { ToolsAccess } from './access-model';

interface SavedTools {
  readonly chatId: string;
  readonly baseline: ToolsAccess['tools'];
  readonly allowed: readonly string[];
}

function appliesTo(saved: SavedTools, chat: ToolsAccess | null): boolean {
  return chat !== null && saved.chatId === chat.id && saved.baseline === chat.tools;
}

export interface ToolPermissions {
  readonly allowed: readonly string[];
  readonly readOnly: boolean;
  readonly saving: boolean;
  readonly save: (next: readonly string[]) => void;
}

export function useToolPermissions(chat: ToolsAccess | null): ToolPermissions | null {
  const owner = useIsOwner();
  const mutation = useMutationState();
  const [saved, setSaved] = useState<SavedTools | null>(null);
  const current = saved !== null && appliesTo(saved, chat) ? saved : null;
  if (saved !== current) setSaved(current);
  if (chat === null) return null;
  const readOnly = isComputerEngine(chat.engine) && !owner;
  const allowed = current?.allowed ?? allowedOf(chat);
  const save = (next: readonly string[]): void => {
    if (readOnly) return;
    mutation.run(() => changeChat(chat.id, { tools: stored(next) }), {
      failure: 'Couldn’t change tools',
      onDone: (row) => {
        if (row !== null)
          setSaved({ chatId: chat.id, baseline: chat.tools, allowed: allowedOf(row) });
      },
    });
  };
  return { allowed, readOnly, saving: mutation.busy, save };
}
