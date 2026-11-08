import { AsyncLocalStorage } from 'node:async_hooks';
import { Service } from '@deepseek-ai/cordis';
import type { Context } from '@deepseek-ai/cordis';
import { WebError } from '@deepseek-ai/dsh-web';
import type { WebSearchRequest, WebSearchResult } from '@deepseek-ai/dsh-web';
import { HarnessRuntimeError } from '../host/errors';

declare module '@deepseek-ai/cordis' {
  interface Context {
    homeWebSearch: HomeWebSearch;
  }
}

const SEARCH_TOOL = 'web_search';

export interface HomeWebSearchRequest {
  readonly sessionId: string;
  readonly query: string;
  readonly maxResults?: number;
}

export interface HomeWebSearchPort {
  readonly offered: (sessionId: string) => boolean;
  readonly search: (
    request: HomeWebSearchRequest,
    signal?: AbortSignal,
  ) => Promise<WebSearchResult>;
}

export class HomeWebSearch extends Service {
  private port: HomeWebSearchPort | undefined;
  private readonly callers = new AsyncLocalStorage<string>();

  constructor(ctx: Context) {
    super(ctx, 'homeWebSearch');
  }

  bind(port: HomeWebSearchPort): () => void {
    this.port = port;
    return (): void => {
      if (this.port === port) this.port = undefined;
    };
  }

  available(): boolean {
    return this.port !== undefined;
  }

  offered(sessionId: string): boolean {
    return this.port?.offered(sessionId) ?? false;
  }

  within<T>(sessionId: string, work: () => Promise<T>): Promise<T> {
    return this.callers.run(sessionId, work);
  }

  search(request: WebSearchRequest, signal?: AbortSignal): Promise<WebSearchResult> {
    const sessionId = this.callers.getStore();
    if (this.port === undefined || sessionId === undefined)
      throw new WebError(
        'Web search needs its initiating conversation.',
        'WEB_PROVIDER_UNAVAILABLE',
      );
    return this.port.search(
      {
        sessionId,
        query: request.query,
        ...(request.maxResults === undefined ? {} : { maxResults: request.maxResults }),
      },
      signal,
    );
  }
}

export function bindHomeWebSearch(ctx: Context, port: HomeWebSearchPort): () => void {
  const service = ctx.get('homeWebSearch');
  if (!(service instanceof HomeWebSearch))
    throw new HarnessRuntimeError('runtime_unavailable', 'Home web search is unavailable.');
  return service.bind(port);
}

export const name = 'home-web-search';

export async function mount(ctx: Context): Promise<void> {
  await ctx.plugin(HomeWebSearch);
  await ctx.inject(['web', 'tools', 'systemPrompt', 'homeWebSearch'], (active: Context): void => {
    const home = active.homeWebSearch;
    active.effect(() =>
      active.web.registerSearchProvider({
        id: name,
        available: () => home.available(),
        search: (request, signal) => home.search(request, signal),
      }),
    );
    active.on('tools/execute', (execution, next) =>
      execution.name === SEARCH_TOOL && execution.agent !== undefined
        ? home.within(execution.agent.id, next)
        : next(),
    );
    active.on('system-prompt/assemble', async (_assembly, context, next) => {
      const result = await next();
      const agent = context.agent;
      if (agent !== undefined && !home.offered(agent.id))
        result.tools = result.tools.filter((tool) => tool.name !== SEARCH_TOOL);
      return result;
    });
  });
}
