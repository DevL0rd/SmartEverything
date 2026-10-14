import type { ChatTimelineTool, ChatToolItem, CodexProviderEvent } from '@smarteverything/domain';
import type { TurnStream } from '../../conversation/stream';
const TOOL_TYPES = new Set([
  'commandExecution',
  'fileChange',
  'mcpToolCall',
  'webSearch',
  'imageView',
  'imageGeneration',
]);
export function streamCodexTools(
  stream: TurnStream,
  event: Extract<CodexProviderEvent, { kind: 'work_item' }>,
): void {
  if (!TOOL_TYPES.has(event.type) || event.item_id === null) return;
  const state = codexToolState(event);
  stream.tool(
    {
      callId: event.item_id,
      name: event.type,
      title: event.type,
      state: snapshotToolState(state),
      detail: 'Native Codex tool',
    },
    { output: event.payload, state },
  );
}

function codexToolState(
  event: Extract<CodexProviderEvent, { kind: 'work_item' }>,
): ChatTimelineTool['state'] {
  const status = event.payload['status'];
  if (status === 'failed') return 'failed';
  if (
    typeof status === 'string' &&
    ['declined', 'interrupted', 'cancelled', 'stopped'].includes(status)
  )
    return 'interrupted';
  if (event.payload['_phase'] !== 'completed') return 'running';
  if (event.type === 'fileChange' && status !== 'completed') return 'unknown';
  return 'done';
}

function snapshotToolState(state: ChatTimelineTool['state']): ChatToolItem['state'] {
  return state === 'unknown' || state === 'interrupted' ? 'failed' : state;
}
