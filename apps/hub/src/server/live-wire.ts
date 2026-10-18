import type { ClientRow, LiveChange, LiveMessage } from '@smarteverything/domain';
import { wireMessage } from '../assistant/wire-message';
import { memberEngineChange } from './member-engine';

const OWNER_NOTICES: ReadonlySet<LiveMessage['type']> = new Set([
  'computer_runtime_status',
  'computer_runtime_native',
  'ai_chat_runtime_provider',
  'computer_ai_status',
  'computer_claude',
  'ai_chat_provider',
]);

function wireChange(change: LiveChange): LiveChange {
  if (change.table === 'plugin_streams') return { ...change, oldRecord: null };
  if (change.table !== 'assistant_messages') return change;
  return {
    ...change,
    record: change.record === null ? null : wireMessage(change.record),
    oldRecord: change.oldRecord === null ? null : wireMessage(change.oldRecord),
  };
}

export function wireText(message: LiveMessage): string {
  return JSON.stringify(message.type === 'change' ? wireChange(message) : message);
}

export function liveText(role: ClientRow['role'], message: LiveMessage): string | null {
  if (role === 'owner') return wireText(message);
  if (OWNER_NOTICES.has(message.type)) return null;
  return wireText(message.type === 'change' ? memberEngineChange(message) : message);
}
