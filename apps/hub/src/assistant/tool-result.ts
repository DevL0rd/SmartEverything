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

function toolOf(store: Store, chatId: string, callId: string): ChatTimelineTool | undefined {
  const embeds = store.assistantChat.withToolCall(chatId, callId)?.embeds ?? [];
  for (const embed of embeds) {
    const timeline = CHAT_TIMELINE_EMBED.safeParse(embed);
    if (!timeline.success) continue;
    for (const part of timeline.data.parts)
      if (part.kind === 'tool' && part.tool.callId === callId) return part.tool;
  }
  return undefined;
}

export function readToolResult(store: Store, request: ToolResultRequest): AiToolResultPage {
  const tool = toolOf(store, request.chatId, request.callId);
  if (tool === undefined)
    throw new ApiError('not_found', `This chat has no tool call ${request.callId}.`);
  return toolResultPage(tool, request.field, request.cursor, request.limit);
}
