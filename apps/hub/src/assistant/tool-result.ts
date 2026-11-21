import {
  ApiError,
  CHAT_TIMELINE_EMBED,
  toolResultPage,
  type AiToolResultPage,
  type ChatTimelineTool,
} from '@smarteverything/domain';
import type { Store } from '../store/store';

export interface ToolResultRequest {
  readonly chatId: string;
  readonly callId: string;
  readonly field: 'output' | 'input';
  readonly cursor: string | undefined;
  readonly limit: number;
}

async function toolOf(
  store: Pick<Store, 'host'>,
  chatId: string,
  callId: string,
): Promise<ChatTimelineTool | undefined> {
  const row = await store.host.call('assistantChat', 'withToolCall', chatId, callId);
  const embeds = row?.embeds ?? [];
  for (const embed of embeds) {
    const timeline = CHAT_TIMELINE_EMBED.safeParse(embed);
    if (!timeline.success) continue;
    for (const part of timeline.data.parts)
      if (part.kind === 'tool' && part.tool.callId === callId) return part.tool;
  }
  return undefined;
}

export async function readToolResult(
  store: Pick<Store, 'host'>,
  request: ToolResultRequest,
): Promise<AiToolResultPage> {
  const tool = await toolOf(store, request.chatId, request.callId);
  if (tool === undefined)
    throw new ApiError('not_found', `This chat has no tool call ${request.callId}.`);
  return toolResultPage(tool, request.field, request.cursor, request.limit);
}
