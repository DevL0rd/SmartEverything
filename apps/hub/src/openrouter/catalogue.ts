import {
  ApiError,
  AUTO_LATEST_GEMINI_FLASH,
  closestEffort,
  displayNameOf,
  googleModelOf,
  latestGeminiFlash,
  UnknownGoogleModelError,
  type AiCatalogueSync,
  type AiEffort,
  type AiModelChoice,
  type AiModelDetail,
  type AiModelList,
  type AiModelRow,
  type AiPricing,
  type AiResolvedModel,
  type AiModelKind,
  type AiProviderCount,
  type OpenRouterSettings,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { Cancel, Clock } from '../clock';
import {
  newestFirst,
  pageOf,
  providersOf,
  topPicksOf,
  type ModelFilter,
  type PageRequest,
} from './catalogue-query';
import { fetchOpenRouterModels, googleRows } from './catalogue-sync';
import type { OpenRouterClient } from './client';
import type { AiModelsRepository } from './models-repository';

const DAY_MS = 86_400_000;
const SYNC_HOUR = 4;
const SYNC_MINUTE = 10;

export interface CatalogueOptions {
  readonly models: AiModelsRepository;
  readonly client: OpenRouterClient;
  readonly clock: Clock;
  readonly log: Logger;
}

export interface CatalogueOverview {
  readonly synced_at: string | null;
  readonly sync_error: string | null;
  readonly default: AiResolvedModel | null;
  readonly models: number;
}

export function nextSyncAt(now: Date): Date {
  const next = new Date(now);
  next.setHours(SYNC_HOUR, SYNC_MINUTE, 0, 0);
  if (next.getTime() <= now.getTime()) {
    next.setDate(next.getDate() + 1);
  }
  return next;
}

function causeText(cause: unknown): string {
  return (cause instanceof Error ? cause.message : String(cause)).slice(0, 400);
}

export class Catalogue {
  private loaded: AiModelRow[] = [];
  private picks: AiModelRow[] = [];
  private timer: Cancel | null = null;
  private running: Promise<AiCatalogueSync> | null = null;
  private readonly listeners = new Set<() => void>();

  constructor(private readonly options: CatalogueOptions) {}

  start(): void {
    this.writeGoogle(this.settings().google_prices);
    const synced = this.options.models.syncState().synced_at;
    const stale = synced === null || this.now() - Date.parse(synced) > DAY_MS;
    if (stale) {
      this.syncInBackground('boot');
    }
    this.schedule();
  }

  stop(): void {
    this.timer?.();
    this.timer = null;
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  sync(): Promise<AiCatalogueSync> {
    this.running ??= this.syncNow().finally(() => {
      this.running = null;
    });
    return this.running;
  }

  overview(): CatalogueOverview {
    const state = this.options.models.syncState();
    return {
      synced_at: state.synced_at,
      sync_error: state.error,
      default: this.defaultModel(),
      models: this.loaded.filter((row) => row.gone_at === null).length,
    };
  }

  list(filter: ModelFilter, page: PageRequest): AiModelList {
    const overview = this.overview();
    return {
      synced_at: overview.synced_at,
      sync_error: overview.sync_error,
      default: overview.default,
      ...pageOf(this.loaded, filter, page),
    };
  }

  providers(kind: AiModelKind | undefined): AiProviderCount[] {
    return providersOf(this.loaded, kind);
  }

  topPicks(kind: AiModelKind): AiModelRow[] {
    return this.picks.filter((row) => row.kinds.includes(kind));
  }

  rows(kind: AiModelKind): readonly AiModelRow[] {
    return this.loaded.filter((row) => row.gone_at === null && row.kinds.includes(kind));
  }

  usable(id: string): AiModelRow | null {
    const row = this.loaded.find((candidate) => candidate.id === id);
    return row?.gone_at === null ? row : null;
  }

  detail(id: string): AiModelDetail {
    return { model: this.model(id), prices: this.options.models.prices(id) };
  }

  model(id: string): AiModelRow {
    const row = this.loaded.find((candidate) => candidate.id === id);
    if (row === undefined) {
      throw new ApiError('not_found', `There is no AI model called ${id}.`);
    }
    return row;
  }

  priceOf(id: string): AiPricing {
    return this.model(id).pricing;
  }

  effortFor(model: AiModelRow, wanted: AiEffort): AiEffort | null {
    return model.reasoning === 'none' ? null : closestEffort(model, wanted);
  }

  settings(): OpenRouterSettings {
    return this.options.models.settings();
  }

  saveDefaults(choice: AiModelChoice, effort: AiEffort): OpenRouterSettings {
    if (choice !== AUTO_LATEST_GEMINI_FLASH) {
      this.chatModel(choice);
    }
    const next = {
      ...this.settings(),
      default_model: choice,
      default_effort: effort,
    };
    this.options.models.saveSettings(next);
    this.changed();
    return next;
  }

  resolve(choice: AiModelChoice | null, effort: AiEffort | null): AiResolvedModel {
    const settings = this.settings();
    const wanted = choice ?? settings.default_model;
    const model =
      wanted === AUTO_LATEST_GEMINI_FLASH ? latestGeminiFlash(this.loaded) : this.chatModel(wanted);
    if (model === null) {
      throw new ApiError(
        'not_found',
        'The model list hasn’t loaded yet, so there is no Gemini Flash to use.',
      );
    }
    return {
      choice: wanted,
      model_id: model.id,
      name: displayNameOf(model, wanted),
      effort: this.effortFor(model, effort ?? settings.default_effort),
    };
  }

  defaultModel(): AiResolvedModel | null {
    return latestGeminiFlash(this.loaded) === null ? null : this.resolve(null, null);
  }

  setGooglePrice(id: string, pricing: AiPricing | null): AiModelDetail {
    try {
      googleModelOf(id);
    } catch (cause) {
      if (cause instanceof UnknownGoogleModelError) {
        throw new ApiError('invalid_request', 'Only Google models have prices you can set.');
      }
      throw cause;
    }
    const settings = this.settings();
    const others = Object.fromEntries(
      Object.entries(settings.google_prices).filter(([modelId]) => modelId !== id),
    );
    const google_prices = pricing === null ? others : { ...others, [id]: pricing };
    this.options.models.saveSettings({ ...settings, google_prices });
    this.writeGoogle(google_prices);
    return this.detail(id);
  }

  private chatModel(id: string): AiModelRow {
    const row = this.model(id);
    if (row.gone_at !== null || !row.kinds.includes('chat')) {
      throw new ApiError('invalid_request', `${row.name} can’t be used for chats.`);
    }
    return row;
  }

  private async syncNow(): Promise<AiCatalogueSync> {
    const syncedAt = this.options.clock.now().toISOString();
    try {
      const fetched = await fetchOpenRouterModels(
        {
          client: this.options.client,
          sleep: (milliseconds) => this.options.clock.sleep(milliseconds),
          log: this.options.log,
        },
        syncedAt,
      );
      const result = this.options.models.replace(fetched.rows, 'openrouter');
      this.writeGoogle(this.settings().google_prices);
      this.options.models.saveSyncState({
        synced_at: syncedAt,
        error: null,
        error_at: null,
      });
      this.options.log.info('ai_models.synced', {
        models: fetched.rows.length,
        ...result,
      });
      return {
        synced_at: syncedAt,
        models: fetched.rows.length,
        skipped: fetched.skipped,
        ...result,
      };
    } catch (cause) {
      const previous = this.options.models.syncState();
      this.options.models.saveSyncState({
        ...previous,
        error: causeText(cause),
        error_at: syncedAt,
      });
      this.changed();
      throw cause;
    }
  }

  private writeGoogle(overrides: Readonly<Record<string, AiPricing>>): void {
    const syncedAt = this.options.clock.now().toISOString();
    this.options.models.replace(googleRows(overrides, syncedAt), 'google');
    this.reload();
  }

  private reload(): void {
    this.loaded = this.options.models.all().sort(newestFirst);
    this.picks = topPicksOf(this.loaded);
    this.changed();
  }

  private changed(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }

  private schedule(): void {
    this.timer = this.options.clock.at(nextSyncAt(this.options.clock.now()), () => {
      this.syncInBackground('daily');
      this.schedule();
    });
  }

  private syncInBackground(reason: string): void {
    this.sync().catch((cause: unknown) => {
      this.options.log.error('ai_models.sync_failed', cause, { reason });
    });
  }

  private now(): number {
    return this.options.clock.now().getTime();
  }
}
