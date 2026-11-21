import type { AiModelPriceRow, AiModelRow, OpenRouterSettings } from '@smarteverything/domain';
import type { ImageEndpointSnapshot } from '../openrouter/image-wire';
import type { ModelSearchState } from '../openrouter/model-search-state';
import type { CatalogueState, UpsertResult } from '../openrouter/models-repository';
import type { StoreHost } from './host/host';
import { storeUnit } from './host/unit';

export class AiModelsStateNotLoadedError extends Error {
  override readonly name = 'AiModelsStateNotLoadedError';

  constructor() {
    super('The AI model catalogue was read before it was loaded from the store host.');
  }
}

export const AI_MODELS_STATE_UNIT = storeUnit((store, _input: null) => ({
  rows: store.aiModels.all(),
  settings: store.aiModels.settings(),
  syncState: store.aiModels.syncState(),
  searchState: store.aiModels.searchState(),
  imageEndpoints: store.aiModels.imageEndpoints(),
}));

interface Loaded {
  rows: readonly AiModelRow[];
  byId: ReadonlyMap<string, AiModelRow>;
  settings: OpenRouterSettings;
  syncState: CatalogueState;
  searchState: ModelSearchState;
  imageEndpoints: ImageEndpointSnapshot;
}

function indexed(rows: readonly AiModelRow[]): ReadonlyMap<string, AiModelRow> {
  return new Map(rows.map((row) => [row.id, row]));
}

export class AiModelsState {
  private loaded: Loaded | null = null;
  private loading: Promise<void> | null = null;
  private writes: Promise<unknown> = Promise.resolve();

  constructor(private readonly host: StoreHost) {}

  load(): Promise<void> {
    this.loading ??= this.fill();
    return this.loading;
  }

  all(): AiModelRow[] {
    return [...this.held().rows];
  }

  row(id: string): AiModelRow | undefined {
    return this.held().byId.get(id);
  }

  prices(modelId: string): Promise<AiModelPriceRow[]> {
    return this.host.call('aiModels', 'prices', modelId);
  }

  recentModelIds(profileId: string): Promise<string[]> {
    return this.host.call('aiModels', 'recentModelIds', profileId);
  }

  settings(): OpenRouterSettings {
    return this.held().settings;
  }

  syncState(): CatalogueState {
    return this.held().syncState;
  }

  searchState(): ModelSearchState {
    return this.held().searchState;
  }

  imageEndpoints(): ImageEndpointSnapshot {
    return this.held().imageEndpoints;
  }

  replace(rows: readonly AiModelRow[], provider: AiModelRow['provider']): Promise<UpsertResult> {
    return this.inOrder(async () => {
      const result = await this.host.call('aiModels', 'replace', [...rows], provider);
      const fresh = await this.host.call('aiModels', 'all');
      const held = this.held();
      held.rows = fresh;
      held.byId = indexed(fresh);
      return result;
    });
  }

  saveSettings(settings: OpenRouterSettings): Promise<OpenRouterSettings> {
    this.held().settings = settings;
    return this.inOrder(() => this.host.call('aiModels', 'saveSettings', settings));
  }

  saveSyncState(state: CatalogueState): Promise<void> {
    this.held().syncState = state;
    return this.inOrder(() => this.host.call('aiModels', 'saveSyncState', state));
  }

  saveSearchState(state: ModelSearchState): Promise<void> {
    this.held().searchState = state;
    return this.inOrder(() => this.host.call('aiModels', 'saveSearchState', state));
  }

  saveImageEndpoints(snapshot: ImageEndpointSnapshot): Promise<void> {
    this.held().imageEndpoints = snapshot;
    return this.inOrder(() => this.host.call('aiModels', 'saveImageEndpoints', snapshot));
  }

  private inOrder<T>(work: () => Promise<T>): Promise<T> {
    const next = this.writes.then(work);
    this.writes = Promise.allSettled([next]);
    return next;
  }

  private held(): Loaded {
    if (this.loaded === null) throw new AiModelsStateNotLoadedError();
    return this.loaded;
  }

  private async fill(): Promise<void> {
    const state = await this.host.read('aiModelsState', null);
    this.loaded = { ...state, byId: indexed(state.rows) };
  }
}
