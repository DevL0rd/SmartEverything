import {
  AI_MODEL_ROW,
  GOOGLE_MODELS,
  GOOGLE_PRICES_CHECKED,
  googlePriceOf,
  type AiModelRow,
  type AiPricing,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import {
  chatModelRow,
  effortsOf,
  googleModelRow,
  imageModelRow,
  videoModelRow,
} from './catalogue-map';
import type { OpenRouterClient } from './client';
import { OpenRouterError } from './errors';
import type { OrImageModel } from './wire';

const BATCH_SUFFIX = ':batch';
const IMAGE_PRICE_CONCURRENCY = 4;
const RETRY_DELAYS_MS = [1000, 4000] as const;

export interface SyncDeps {
  readonly client: OpenRouterClient;
  readonly sleep: (milliseconds: number) => Promise<void>;
  readonly log: Logger;
}

async function retried<T>(deps: SyncDeps, work: () => Promise<T>): Promise<T> {
  for (const delay of RETRY_DELAYS_MS) {
    try {
      return await work();
    } catch (cause) {
      if (!(cause instanceof OpenRouterError) || !cause.retryable) {
        throw cause;
      }
      deps.log.warn('ai_models.retry', { reason: cause.message, delay });
      await deps.sleep(delay);
    }
  }
  return work();
}

export interface FetchedCatalogue {
  readonly rows: readonly AiModelRow[];
  readonly skipped: number;
}

async function inBatches<T, R>(
  items: readonly T[],
  size: number,
  work: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  for (let start = 0; start < items.length; start += size) {
    results.push(...(await Promise.all(items.slice(start, start + size).map(work))));
  }
  return results;
}

interface ImageRows {
  readonly rows: AiModelRow[];
  readonly unavailable: string[];
}

async function imageRows(
  deps: SyncDeps,
  known: ReadonlySet<string>,
  syncedAt: string,
): Promise<ImageRows> {
  const listed = await retried(deps, () => deps.client.imageModels());
  const extra = listed.filter((model) => !known.has(model.id));
  const priced = await inBatches(extra, IMAGE_PRICE_CONCURRENCY, async (model: OrImageModel) => ({
    model,
    prices: await retried(deps, () => deps.client.imagePrices(model)),
  }));
  return {
    rows: priced.flatMap(({ model, prices }) =>
      prices === null ? [] : [imageModelRow(model, prices, syncedAt)],
    ),
    unavailable: priced.filter(({ prices }) => prices === null).map(({ model }) => model.id),
  };
}

export async function fetchOpenRouterModels(
  deps: SyncDeps,
  syncedAt: string,
): Promise<FetchedCatalogue> {
  const [chat, video, transcription] = await Promise.all([
    retried(deps, () => deps.client.models()),
    retried(deps, () => deps.client.videoModels()),
    retried(deps, () => deps.client.transcriptionModels()),
  ]);
  const unknownEfforts = new Set<string>();
  const models = [
    ...new Map([...chat, ...transcription].map((model) => [model.id, model])).values(),
  ];
  const chatRows = models
    .filter((model) => !model.id.endsWith(BATCH_SUFFIX))
    .map((model) => {
      const efforts = effortsOf(model);
      efforts.unknown.forEach((effort) => unknownEfforts.add(effort));
      return chatModelRow(model, syncedAt, efforts);
    });
  const known = new Set(chatRows.map((row) => row.id));
  const images = await imageRows(deps, known, syncedAt);
  if (unknownEfforts.size > 0) {
    deps.log.warn('ai_models.unknown_efforts', { efforts: [...unknownEfforts].join(', ') });
  }
  if (images.unavailable.length > 0) {
    deps.log.info('ai_models.no_endpoints', { ids: images.unavailable.join(', ') });
  }
  const checked = validRows(
    [
      ...chatRows,
      ...video
        .filter((model) => !known.has(model.id))
        .map((model) => videoModelRow(model, syncedAt)),
      ...images.rows,
    ],
    deps.log,
  );
  return { rows: checked.rows, skipped: checked.skipped + images.unavailable.length };
}

function validRows(candidates: readonly AiModelRow[], log: Logger): FetchedCatalogue {
  const rows: AiModelRow[] = [];
  const rejected: string[] = [];
  for (const candidate of candidates) {
    const parsed = AI_MODEL_ROW.safeParse(candidate);
    if (parsed.success) {
      rows.push(parsed.data);
    } else {
      rejected.push(candidate.id);
    }
  }
  if (rejected.length > 0) {
    log.warn('ai_models.skipped', {
      count: rejected.length,
      ids: rejected.slice(0, 20).join(', '),
    });
  }
  return { rows, skipped: rejected.length };
}

export function googleRows(
  overrides: Readonly<Record<string, AiPricing>>,
  syncedAt: string,
): AiModelRow[] {
  const created = `${GOOGLE_PRICES_CHECKED}T00:00:00.000Z`;
  return GOOGLE_MODELS.map((model) =>
    AI_MODEL_ROW.parse(
      googleModelRow(model, googlePriceOf(model.id, overrides), syncedAt, created),
    ),
  );
}
