import { z } from 'zod';
import {
  ApiError,
  AI_EFFORT,
  WEB_SOURCE,
  type AiEffort,
  WEB_SOURCES_EMBED,
  type AiChatRow,
  type WebSource,
} from '@smarteverything/domain';
import type { HubTool, HubToolResult, ToolCaller, ToolSource } from '../ai-tools/hub-tool';
import type { HarnessService } from '../harness/service';
import type { OpenRouterClient } from '../openrouter/client';
import type { ChatRequest } from '../openrouter/chat-types';
import { TurnAccumulator } from '../openrouter/turn';
import { meteredAccountingFetch } from '../harness/metered-accounting';
import { currentRequestSignal } from '../server/request-signal';
import { mergedSources } from './web-search';
const INPUT = z.strictObject({ query: z.string().trim().min(1) });
const TOOL: HubTool = {
  name: 'web_search',
  title: 'Search the web',
  description:
    'Search the web through this chat’s selected OpenRouter model and return its grounded answer and exact source URLs. Available with an explicit ready OpenRouter supplier, subject to the chat’s tool grants.',
  inputSchema: z.toJSONSchema(INPUT, { io: 'input' }),
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    openWorldHint: true,
    idempotentHint: false,
  },
  origin: { kind: 'core' },
  humanOnly: false,
};
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
export function webSearchSource(service: HarnessService, client: OpenRouterClient): ToolSource {
  return {
    tools: () => [TOOL],
    validate: (_tool, input): string | null => {
      const parsed = INPUT.safeParse(input);
      return parsed.success ? null : 'Expected a nonempty web search query.';
    },
    changes: (): (() => void) => (): void => undefined,
    call: (_tool, input, caller) => search(service, client, caller, INPUT.parse(input).query),
  };
}
async function search(
  service: HarnessService,
  client: OpenRouterClient,
  caller: ToolCaller,
  query: string,
): Promise<HubToolResult> {
  const { id, model, effort, verify } = searchAdmission(service, caller);
  const scoped = client.usingFetch((fetcher) =>
    meteredAccountingFetch(service, id, fetcher, { verify }),
  );
  const result = (await groundedTurn(scoped, searchRequest(model, effort, query))).result();
  if (result.toolCalls.length !== 0)
    throw new ApiError(
      'upstream_failed',
      'The search supplier requested local tools; no tools were executed.',
    );
  const sources = result.citations.flatMap((source) => {
    const parsed = WEB_SOURCE.safeParse(source);
    return parsed.success ? [parsed.data] : [];
  });
  rememberSources(service, id, sources);
  return {
    response: {
      text: result.text,
      sources,
      model: result.model,
      supplier: 'OpenRouter',
    },
    line: 'Searched the web',
    pictures: [],
  };
}
export function groundedTurn(
  client: OpenRouterClient,
  request: ChatRequest,
): Promise<TurnAccumulator> {
  return client.retrying(async (signal) => {
    const attempt = new TurnAccumulator();
    for await (const chunk of client.chat(request, signal)) attempt.feed(chunk);
    return attempt;
  }, currentRequestSignal());
}
function searchRequest(model: string, effort: AiEffort | null, query: string): ChatRequest {
  return {
    model,
    effort,
    messages: [
      {
        role: 'system',
        content:
          'Answer the supplied web search query using current sources. Return facts with citations. Do not request or execute any local tools.',
      },
      { role: 'user', content: query },
    ],
    webSearch: true,
  };
}
interface SearchAdmission {
  readonly id: string;
  readonly model: string;
  readonly effort: AiEffort | null;
  readonly verify: () => void;
}
function searchAdmission(service: HarnessService, caller: ToolCaller): SearchAdmission {
  if (caller.chatId === null)
    throw new ApiError('forbidden', 'Web search needs its initiating conversation.');
  const chat = service.own({ profileId: caller.profileId, role: caller.role }, caller.chatId);
  if (
    chat.engine.kind !== 'dsh' ||
    chat.engine.session_id === null ||
    !openRouterSearchAvailable(service, chat)
  )
    throw new ApiError(
      'forbidden',
      'Web search needs a chat on an OpenRouter model. Subscription and native routes have no paid fallback.',
    );
  return {
    id: chat.engine.session_id,
    model: chat.engine.model,
    effort: AI_EFFORT.nullable().parse(chat.engine.effort),
    verify: (): void => {
      if (!openRouterSearchAvailable(service, service.store.aiChats.chat(chat.id)))
        throw new ApiError('forbidden', 'This chat’s web-search supplier changed.');
    },
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
