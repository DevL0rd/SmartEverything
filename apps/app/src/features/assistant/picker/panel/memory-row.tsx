import type { ReactNode } from 'react';
import type { AiChatRow } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { SwitchRow } from '../../../../components/rows';
import { changeChat } from '../../chats/chat-actions';
import { chatMemoryRow, type ChatMemoryRow } from '../../details/memory-model';
import { useMemoryList, useMemorySession } from '../../memory/memory-data';
import { KeyedRow } from './panel-chrome';

export const MEMORY_ROW = 'memory';

export interface MemoryControl extends ChatMemoryRow {
  readonly change: (value: boolean) => void;
}

export function useMemoryControl(chat: AiChatRow): MemoryControl {
  const session = useMemorySession();
  const person = useMemoryList(session).data?.settings.enabled ?? null;
  const row = chatMemoryRow(chat.memory, person);
  return {
    ...row,
    change: (memory): void => {
      if (!row.disabled) background(changeChat(chat.id, { memory }), 'chat.change_failed');
    },
  };
}

export function MemoryRow({ control }: { readonly control: MemoryControl }): ReactNode {
  return (
    <KeyedRow id={MEMORY_ROW} className="rounded-sm">
      <SwitchRow
        compact
        title="Memory"
        subtitle={control.subtitle}
        icon="lightbulb"
        value={control.value}
        disabled={control.disabled}
        onChange={control.change}
      />
    </KeyedRow>
  );
}
