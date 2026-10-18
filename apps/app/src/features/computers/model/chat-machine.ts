import type { AiChatRow, Engine } from '@smarteverything/domain';
import type { Turns } from '../../../store/chat-turns';
import { isWorking } from '../../../store/chat-turns';

export interface ChatCounts {
  readonly running: number;
  readonly total: number;
}

export function machineOf(engine: Engine): string | null {
  switch (engine.kind) {
    case 'claude':
    case 'codex':
      return engine.device_id;
    case 'dsh':
      return engine.execution_target.kind === 'device' ? engine.execution_target.device_id : null;
    case 'openrouter':
      return null;
  }
}

export type MachineChat = Pick<
  AiChatRow,
  'id' | 'kind' | 'archived_at' | 'deletion_state' | 'engine'
>;

export function chatCounts(
  chats: readonly MachineChat[],
  turns: Turns,
  deviceId: string,
): ChatCounts {
  let running = 0;
  let total = 0;
  for (const chat of chats) {
    if (chat.kind !== 'chat' || chat.archived_at !== null || chat.deletion_state !== null) continue;
    if (machineOf(chat.engine) !== deviceId) continue;
    total += 1;
    const turn = turns[chat.id];
    if (turn !== undefined && isWorking(turn)) running += 1;
  }
  return { running, total };
}

export function chatsLine({ running, total }: ChatCounts): string {
  if (total === 0) return 'No chats yet';
  const all = `${String(total)} ${total === 1 ? 'chat' : 'chats'}`;
  return running === 0 ? all : `${String(running)} running · ${all}`;
}
