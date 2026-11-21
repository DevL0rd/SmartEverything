import {
  ApiError,
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
  const { chat } = service.sessions.get(sessionId);
  return { chat, offered: openRouterSearchAvailable(service, chat) };
}

async function search(
  service: HarnessService,
  complete: SearchCompletion,
  request: HomeSearchRequest,
  signal: AbortSignal | undefined,
): Promise<HomeSearchAnswer> {
  const { sessionId, query } = request;
  const { routeId, model } = searchAdmission(service, sessionId);
  const citations = new SearchCitations();
  const content = await withSearchCitations(citations, () =>
    complete({ provider: routeId, model, sessionId, system: SEARCH_SYSTEM, input: query }, signal),
  );
  const sources = citations.sources();
  await rememberSources(service, sessionId, sources);
  return { content, sources, truncated: false };
}

const SEARCH_SYSTEM =
  'Answer the supplied web search query using current sources. Return facts with citations. Do not request or execute any local tools.';

interface SearchAdmission {
  readonly routeId: string;
  readonly model: string;
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
  };
}

async function rememberSources(
  service: HarnessService,
  id: string,
  sources: readonly WebSource[],
): Promise<void> {
  const grant = await service.storage.grant(id);
  if (grant.event_id === null) return;
  const { host } = service.store;
  const delivery = await host.call('harnessDeliveries', 'find', grant.event_id);
  if (delivery?.reply_id === null || delivery?.reply_id === undefined) return;
  const row = await host.call('assistantChat', 'message', delivery.reply_id);
  const prior = row.embeds.flatMap((embed) => {
    const parsed = WEB_SOURCES_EMBED.safeParse(embed);
    return parsed.success ? parsed.data.sources : [];
  });
  const merged = mergedSources(prior, sources);
  if (merged.length > 0)
    await host.call('assistantChat', 'updateMessage', row.id, {
      embeds: [
        ...row.embeds.filter((embed) => embed.kind !== 'web_sources'),
        { kind: 'web_sources', sources: merged },
      ],
    });
}
