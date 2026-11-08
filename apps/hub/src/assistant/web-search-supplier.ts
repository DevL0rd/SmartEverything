import {
  ApiError,
  AI_EFFORT,
  type AiEffort,
  WEB_SOURCES_EMBED,
  type AiChatRow,
  type WebSource,
} from '@smarteverything/domain';
import type { HarnessService } from '../harness/service';
import type { AuxCompletionRequest } from '@smarteverything/harness/process';
import { mergedSources } from './web-search';
import { SearchCitations, withSearchCitations } from './web-search-citations';

export interface HomeSearchRequest {
  readonly sessionId: string;
  readonly query: string;
  readonly maxResults?: number;
}

export interface HomeSearchAnswer {
  readonly content: string;
  readonly sources: readonly WebSource[];
  readonly truncated: boolean;
}

export interface HomeSearchProvider {
  readonly offered: (sessionId: string) => boolean;
  readonly search: (request: HomeSearchRequest, signal?: AbortSignal) => Promise<HomeSearchAnswer>;
}

export function openRouterSearchAvailable(service: HarnessService, chat: AiChatRow): boolean {
  if (chat.engine.kind !== 'dsh') return false;
  const id = chat.engine.model_route_id;
  return service.routes
    .list(chat.profile_id)
    .some(
      (route) =>
        route.id === id &&
        route.auth.provider === 'openrouter' &&
        route.state === 'ready' &&
        route.models.some((model) => model.id === chat.engine.model),
    );
}

export type SearchCompletion = (
  request: AuxCompletionRequest,
  signal?: AbortSignal,
) => Promise<string>;

export function homeSearchProvider(
  service: HarnessService,
  complete: SearchCompletion,
): HomeSearchProvider {
  return {
    offered: (sessionId) => sessionChat(service, sessionId).offered,
    search: (request, signal) => search(service, complete, request, signal),
  };
}

interface SessionChat {
  readonly chat: AiChatRow;
  readonly offered: boolean;
}

function sessionChat(service: HarnessService, sessionId: string): SessionChat {
  const grant = service.storage.grant(sessionId);
  const metadata = service.store.dshSessions.stat(sessionId, grant.profile_id);
  if (metadata === undefined)
    throw new ApiError('forbidden', 'Web search lost its initiating conversation.');
  const chat = service.store.aiChats.chat(metadata.chat_id);
  return { chat, offered: openRouterSearchAvailable(service, chat) };
}

async function search(
  service: HarnessService,
  complete: SearchCompletion,
  request: HomeSearchRequest,
  signal: AbortSignal | undefined,
): Promise<HomeSearchAnswer> {
  const { sessionId, query } = request;
  const { routeId, model, effort } = searchAdmission(service, sessionId);
  const citations = new SearchCitations();
  const content = await withSearchCitations(citations, () =>
    complete(
      { provider: routeId, model, sessionId, system: SEARCH_SYSTEM, input: query, effort },
      signal,
    ),
  );
  const sources = citations.sources();
  rememberSources(service, sessionId, sources);
  return { content, sources, truncated: false };
}

const SEARCH_SYSTEM =
  'Answer the supplied web search query using current sources. Return facts with citations. Do not request or execute any local tools.';

interface SearchAdmission {
  readonly routeId: string;
  readonly model: string;
  readonly effort: AiEffort | null;
}

function searchAdmission(service: HarnessService, sessionId: string): SearchAdmission {
  const { chat, offered } = sessionChat(service, sessionId);
  if (chat.engine.kind !== 'dsh' || !offered)
    throw new ApiError(
      'forbidden',
      'Web search needs a chat on an OpenRouter model. Subscription and native routes have no paid fallback.',
    );
  return {
    routeId: chat.engine.model_route_id,
    model: chat.engine.model,
    effort: AI_EFFORT.nullable().parse(chat.engine.effort),
  };
}

function rememberSources(service: HarnessService, id: string, sources: readonly WebSource[]): void {
  const grant = service.storage.grant(id);
  if (grant.event_id === null) return;
  const delivery = service.store.harnessDeliveries.find(grant.event_id);
  if (delivery?.reply_id === null || delivery?.reply_id === undefined) return;
  const row = service.store.assistantChat.message(delivery.reply_id);
  const prior = row.embeds.flatMap((embed) => {
    const parsed = WEB_SOURCES_EMBED.safeParse(embed);
    return parsed.success ? parsed.data.sources : [];
  });
  const merged = mergedSources(prior, sources);
  if (merged.length > 0)
    service.store.assistantChat.updateMessage(row.id, {
      embeds: [
        ...row.embeds.filter((embed) => embed.kind !== 'web_sources'),
        { kind: 'web_sources', sources: merged },
      ],
    });
}

export function savedWebSources(service: HarnessService, message: string): readonly WebSource[] {
  return service.store.assistantChat.message(message).embeds.flatMap((embed) => {
    const parsed = WEB_SOURCES_EMBED.safeParse(embed);
    return parsed.success ? parsed.data.sources : [];
  });
}
