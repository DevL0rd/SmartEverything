import type { Context } from '@deepseek-ai/cordis';
import { z } from 'zod';
import {
  ApiError,
  AI_EFFORT,
  WEB_SOURCE,
  WEB_SOURCES_MAX,
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
import { mergedSources } from './web-search';
const SEARCH_TIMEOUT_MS = 30_000;
const INPUT = z.strictObject({ query: z.string().trim().min(1).max(4000) });
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
      return parsed.success
        ? null
        : 'Expected a nonempty web search query of at most 4000 characters.';
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
  const turn = new TurnAccumulator();
  for await (const chunk of scoped.chat(
    searchRequest(model, effort, query),
    AbortSignal.timeout(SEARCH_TIMEOUT_MS),
  )) {
    verify();
    turn.feed(chunk);
  }
  const result = turn.result();
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
      'This conversation has no authorized OpenRouter web-search route. Subscription and native routes have no paid fallback.',
    );
  const id = chat.engine.session_id;
  const claim = service.store.dshSessions.writerState(id, caller.profileId).claim;
  if (claim === null) throw new ApiError('conflict', 'Web search lost its native writer.');
  const verify = (): void => {
    const current = service.store.aiChats.chat(chat.id);
    if (!openRouterSearchAvailable(service, current))
      throw new ApiError('forbidden', 'This chat’s web-search supplier changed.');
    const grant = service.storage.grant(id);
    if (
      current.engine.kind !== 'dsh' ||
      current.engine.session_id !== id ||
      current.engine.model_route_id !== grant.route.route_id ||
      current.engine.model !== grant.route.model
    )
      throw new ApiError(
        'conflict',
        'Web search no longer matches its exact admitted native route.',
      );
    service.routes.selected(caller.profileId, grant.route, grant.authority.kind === 'trigger');
    service.store.dshSessions.verifyWriter(
      claim,
      service.hostPrincipal(caller.profileId, service.directory.get(claim.target).host),
    );
  };
  return {
    id,
    model: chat.engine.model,
    effort: AI_EFFORT.nullable().parse(chat.engine.effort),
    verify,
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
  const merged = mergedSources(prior, sources).slice(0, WEB_SOURCES_MAX);
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

export function limitSearchToolSchemas(ctx: Context, service: HarnessService): void {
  ctx.on('system-prompt/assemble', async (_assembly, context, next) => {
    const assembled = await next();
    if (context.agent !== undefined) {
      const grant = service.storage.grant(context.agent.id);
      const metadata = service.store.dshSessions.stat(context.agent.id, grant.profile_id);
      if (metadata === undefined)
        throw new ApiError('conflict', 'Web-search discovery lost its initiating chat.');
      const available = openRouterSearchAvailable(
        service,
        service.store.aiChats.chat(metadata.chat_id),
      );
      if (!available) assembled.tools = assembled.tools.filter((tool) => tool.name !== TOOL.name);
    }
    return assembled;
  });
}
