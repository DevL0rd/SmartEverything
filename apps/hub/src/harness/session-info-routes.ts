import { API_ENDPOINTS } from '@smarteverything/domain';
import type { AiSessionInfo, DshSessionMetadata } from '@smarteverything/domain';
import { bound } from '../server/router';
import { chatOwnerOf } from '../server/auth';
import type { ChatOwner } from '../assistant/chat-directory';
import type { HarnessService } from './service';
import { sessionLogOf } from './workspace-routes';
import type { ChatSessionSource } from './workspace-routes';

export type SessionInfoFold = (
  metadata: DshSessionMetadata,
  events: unknown,
) => Promise<AiSessionInfo>;

export const NO_SESSION_INFO: AiSessionInfo = {
  stats: {
    turns: 0,
    steps: 0,
    llm_ms: 0,
    tool_ms: 0,
    ttft_ms: 0,
    ttft_steps: 0,
    decode_ms: 0,
    decode_tokens: 0,
  },
  turns: [],
};

export async function readSessionInfo(
  source: ChatSessionSource,
  fold: SessionInfoFold,
  owner: ChatOwner,
  chatId: string,
): Promise<AiSessionInfo> {
  const session = sessionLogOf(source, owner, chatId);
  return session === null ? NO_SESSION_INFO : fold(session.metadata, session.events);
}

export const sessionInfoRoutes = (service: HarnessService, fold: SessionInfoFold) =>
  ({
    readAiChatSessionInfo: bound(API_ENDPOINTS.readAiChatSessionInfo, ({ params, caller }) =>
      readSessionInfo(service, fold, chatOwnerOf(service.store, caller), params.chatId),
    ),
  }) as const;
