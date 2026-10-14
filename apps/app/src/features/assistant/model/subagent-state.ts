import type { AiAgentRun, AiAgentState } from '@smarteverything/domain';
import type { ChatEntry } from '../chats/chat-entry';

const TERMINAL: ReadonlySet<AiAgentState> = new Set([
  'completed',
  'failed',
  'stopped',
  'interrupted',
]);

export function terminalAgent(run: AiAgentRun): boolean {
  return TERMINAL.has(run.state);
}

export function inactiveChild(entry: ChatEntry, runs: readonly AiAgentRun[]): AiAgentRun | null {
  const matching = runs.filter((run) => run.child_chat_id === entry.id);
  if (entry.kind !== 'subagent' || entry.line.kind === 'working' || matching.length !== 1)
    return null;
  const current = matching[0];
  return current !== undefined && terminalAgent(current) ? current : null;
}

export function runBoundToChat(
  run: AiAgentRun,
  parentId: string,
  childId: string | undefined,
): boolean {
  return (
    run.parent_chat_id === parentId && (childId === undefined || run.child_chat_id === childId)
  );
}
