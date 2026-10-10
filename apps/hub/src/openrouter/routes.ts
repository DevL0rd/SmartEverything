import {
  AI_MODEL_ENDPOINTS as E,
  ApiError,
  type ApiErrorCode,
  type OpenRouterAccount,
  type OpenRouterCredits,
  type OpenRouterStatus,
} from '@smarteverything/domain';
import { clientOf, profileIdOf, type Caller } from '../server/auth';
import type { ServerContext } from '../server/context';
import { bound, type Bound } from '../server/router';
import type { ModelFilter, PageRequest } from './catalogue-query';
import { OpenRouterError, type OpenRouterErrorCode } from './errors';
import { discordinatorHasKey, readDiscordinatorKey } from './key-import';
import { suggestionsOf } from './model-suggestions';
import type { OpenRouterPlatform } from './platform';

type AiModelRoutes = Record<keyof typeof E, Bound>;

const API_CODES: Readonly<Record<OpenRouterErrorCode, ApiErrorCode>> = {
  no_key: 'invalid_request',
  unauthorized: 'upstream_failed',
  no_credits: 'upstream_failed',
  rate_limited: 'rate_limited',
  unavailable: 'upstream_failed',
  bad_request: 'upstream_failed',
  not_found: 'upstream_failed',
  refused: 'upstream_failed',
  unreadable: 'upstream_failed',
  failed: 'upstream_failed',
};

async function upstream<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (cause) {
    if (cause instanceof OpenRouterError) {
      throw new ApiError(API_CODES[cause.code], cause.message);
    }
    throw cause;
  }
}

function onThisComputer(caller: Caller): void {
  if (!clientOf(caller).built_in) {
    throw new ApiError(
      'forbidden',
      'Import the key in the desktop app on the computer that runs SmartEverything.',
    );
  }
}

async function statusOf(platform: OpenRouterPlatform): Promise<OpenRouterStatus> {
  const { catalogue } = platform;
  return {
    key: platform.keys.current() === null ? 'missing' : 'set',
    sources: (await discordinatorHasKey()) ? ['discordinator'] : [],
    settings: catalogue.settings(),
    ...catalogue.overview(),
  };
}

async function creditsOf(platform: OpenRouterPlatform): Promise<OpenRouterCredits> {
  try {
    return { state: 'known', ...(await platform.client.credits()) };
  } catch (cause) {
    if (cause instanceof OpenRouterError && cause.code === 'refused') {
      return { state: 'needs_management_key' };
    }
    throw cause;
  }
}

async function accountOf(platform: OpenRouterPlatform): Promise<OpenRouterAccount> {
  const [key, credits] = await Promise.all([platform.client.key(), creditsOf(platform)]);
  return {
    label: key.label,
    limit: key.limit,
    limit_remaining: key.limitRemaining,
    limit_reset: key.limitReset,
    usage: key.usage,
    usage_daily: key.usageDaily,
    usage_weekly: key.usageWeekly,
    usage_monthly: key.usageMonthly,
    free_tier: key.freeTier,
    credits,
    checked_at: platform.clock.now().toISOString(),
  };
}

async function importKey(platform: OpenRouterPlatform): Promise<OpenRouterStatus> {
  const key = await readDiscordinatorKey();
  if (key === null) {
    throw new ApiError(
      'not_found',
      'There is no OpenRouter key in Discordinator on this computer.',
    );
  }
  await upstream(() => platform.keys.save(key));
  return statusOf(platform);
}

interface ListQuery {
  readonly kind?: ModelFilter['kind'] | undefined;
  readonly q?: string | undefined;
  readonly provider?: string | undefined;
  readonly cursor?: string | undefined;
  readonly limit: number;
  readonly gone: boolean;
}

function filterOf(query: ListQuery): ModelFilter {
  return {
    gone: query.gone,
    ...(query.kind === undefined ? {} : { kind: query.kind }),
    ...(query.q === undefined ? {} : { q: query.q }),
    ...(query.provider === undefined ? {} : { provider: query.provider }),
  };
}

function pageRequestOf(query: ListQuery): PageRequest {
  return {
    limit: query.limit,
    ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
  };
}

function pickerRoutes(
  context: ServerContext,
): Pick<
  AiModelRoutes,
  'listAiModels' | 'suggestedAiModels' | 'listAiModelProviders' | 'readAiModel'
> {
  const { catalogue } = context.openRouter;
  return {
    listAiModels: bound(E.listAiModels, ({ query }) =>
      catalogue.list(filterOf(query), pageRequestOf(query)),
    ),
    suggestedAiModels: bound(E.suggestedAiModels, ({ query, caller }) =>
      suggestionsOf(
        {
          catalogue,
          models: context.store.aiModels,
          personal: context.store.personal,
        },
        {
          owner: {
            clientId: clientOf(caller).id,
            profileId: profileIdOf(context.store, caller),
          },
          kind: query.kind,
          current: query.current,
        },
      ),
    ),
    listAiModelProviders: bound(E.listAiModelProviders, ({ query }) =>
      catalogue.providers(query.kind),
    ),
    readAiModel: bound(E.readAiModel, ({ params }) => catalogue.detail(params.id)),
  };
}

export function aiModelRoutes(context: ServerContext): AiModelRoutes {
  const platform = context.openRouter;
  const { catalogue, keys } = platform;
  return {
    ...pickerRoutes(context),
    refreshAiModels: bound(E.refreshAiModels, () => upstream(() => catalogue.sync())),
    setAiModelPrice: bound(E.setAiModelPrice, ({ params, body }) =>
      catalogue.setGooglePrice(params.id, body.pricing),
    ),
    readOpenRouter: bound(E.readOpenRouter, () => statusOf(platform)),
    setOpenRouterDefaults: bound(E.setOpenRouterDefaults, ({ body }) => {
      catalogue.saveDefaults(body.default_model, body.default_effort);
      return statusOf(platform);
    }),
    setOpenRouterKey: bound(E.setOpenRouterKey, async ({ body }) => {
      await upstream(() => keys.save(body.key));
      return statusOf(platform);
    }),
    importOpenRouterKey: bound(E.importOpenRouterKey, ({ caller }) => {
      onThisComputer(caller);
      return importKey(platform);
    }),
    removeOpenRouterKey: bound(E.removeOpenRouterKey, async () => {
      await keys.remove();
      return statusOf(platform);
    }),
    readOpenRouterAccount: bound(E.readOpenRouterAccount, () =>
      upstream(() => accountOf(platform)),
    ),
  };
}
