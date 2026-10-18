import {
  AI_MODEL_PRICE_ROW,
  AI_MODEL_ROW,
  OPENROUTER_DEFAULTS,
  OPENROUTER_SETTINGS,
  type AiModelPriceRow,
  type AiModelRow,
  type OpenRouterSettings,
} from '@smarteverything/domain';
import { z } from 'zod';
import {
  EMPTY_IMAGE_ENDPOINTS,
  IMAGE_ENDPOINT_SNAPSHOT,
  type ImageEndpointSnapshot,
} from './image-wire';
import {
  EMPTY_MODEL_SEARCH_STATE,
  MODEL_SEARCH_STATE,
  type ModelSearchState,
} from './model-search-state';
import { storedRow } from '../store/codec';
import type { StoreContext } from '../store/context';
import { jsonText } from '../store/sql';

const ARRAYS = [
  'input_modalities',
  'output_modalities',
  'supported_parameters',
  'efforts',
  'kinds',
] as const;

const STORED_MODEL = storedRow(AI_MODEL_ROW, {
  json: [...ARRAYS, 'pricing'],
  flags: ['tools'],
});

const STORED_PRICE = storedRow(AI_MODEL_PRICE_ROW, { json: ['pricing'] });

const COLUMNS = [
  'id',
  'provider',
  'name',
  'author',
  'author_name',
  'family',
  'description',
  'created',
  'context_length',
  'max_output',
  ...ARRAYS,
  'reasoning',
  'default_effort',
  'tools',
  'alias_of',
  'pricing',
  'expires_at',
  'synced_at',
  'gone_at',
] as const;

const COLUMN_LIST = COLUMNS.join(', ');

const SETTINGS_KEY = 'openrouter';
const RECENT_SCAN = 30;

const RECENT = z.strictObject({
  id: z.string().min(1),
  used: z.string().min(1),
});
const SYNC_KEY = 'catalogue';

const MOMENT = z.iso.datetime({ offset: true });

const CATALOGUE_STATE = z.strictObject({
  synced_at: MOMENT.nullable(),
  error: z.string().max(400).nullable(),
  error_at: MOMENT.nullable(),
});

export type CatalogueState = z.infer<typeof CATALOGUE_STATE>;

const NEVER_SYNCED: CatalogueState = {
  synced_at: null,
  error: null,
  error_at: null,
};

const STORED_SETTING = storedRow(z.strictObject({ settings: z.unknown() }), {
  json: ['settings'],
});

export interface UpsertResult {
  readonly added: number;
  readonly repriced: number;
  readonly gone: number;
}

function parametersOf(row: AiModelRow): Record<string, string | number | null> {
  return {
    id: row.id,
    provider: row.provider,
    name: row.name,
    author: row.author,
    author_name: row.author_name,
    family: row.family,
    description: row.description,
    created: row.created,
    context_length: row.context_length,
    max_output: row.max_output,
    input_modalities: jsonText(row.input_modalities),
    output_modalities: jsonText(row.output_modalities),
    supported_parameters: jsonText(row.supported_parameters),
    efforts: jsonText(row.efforts),
    kinds: jsonText(row.kinds),
    reasoning: row.reasoning,
    default_effort: row.default_effort,
    tools: row.tools ? 1 : 0,
    alias_of: row.alias_of,
    pricing: jsonText(row.pricing),
    expires_at: row.expires_at,
    synced_at: row.synced_at,
    gone_at: row.gone_at,
  };
}

export class AiModelsRepository {
  constructor(private readonly context: StoreContext) {}

  all(): AiModelRow[] {
    return this.context.sql.all(
      STORED_MODEL,
      `select ${COLUMN_LIST} from ai_models order by created desc`,
    );
  }

  row(id: string): AiModelRow | undefined {
    return this.context.sql.get(
      STORED_MODEL,
      `select ${COLUMN_LIST} from ai_models where id = $id`,
      { id },
    );
  }

  prices(modelId: string): AiModelPriceRow[] {
    return this.context.sql.all(
      STORED_PRICE,
      `select model_id, effective_at, pricing from ai_model_prices
        where model_id = $modelId order by effective_at desc`,
      { modelId },
    );
  }

  replace(rows: readonly AiModelRow[], provider: AiModelRow['provider']): UpsertResult {
    return this.context.write(() => {
      const known = new Map(this.all().map((row) => [row.id, row]));
      let added = 0;
      let repriced = 0;
      for (const row of rows) {
        const before = known.get(row.id);
        const pricing = jsonText(row.pricing);
        this.upsert(row);
        if (before === undefined || jsonText(before.pricing) !== pricing) {
          this.price(row);
          added += before === undefined ? 1 : 0;
          repriced += before === undefined ? 0 : 1;
        }
      }
      const gone = this.markGone(provider, new Set(rows.map((row) => row.id)));
      return { added, repriced, gone };
    });
  }

  recentModelIds(profileId: string): string[] {
    return this.context.sql
      .all(
        RECENT,
        `select id, max(used) as used from (
          select model_id as id, at as used from ai_usage
            where profile_id = $profileId and model_id is not null
          union all
          select json_extract(engine, '$.model') as id, updated_at as used from ai_chats
            where profile_id = $profileId and json_extract(engine, '$.model') is not null
        ) group by id order by used desc limit $limit`,
        { profileId, limit: RECENT_SCAN },
      )
      .map((row) => row.id);
  }

  settings(): OpenRouterSettings {
    return this.setting(SETTINGS_KEY, OPENROUTER_SETTINGS, OPENROUTER_DEFAULTS);
  }

  saveSettings(settings: OpenRouterSettings): OpenRouterSettings {
    this.saveSetting(SETTINGS_KEY, OPENROUTER_SETTINGS.parse(settings));
    return settings;
  }

  syncState(): CatalogueState {
    return this.setting(SYNC_KEY, CATALOGUE_STATE, NEVER_SYNCED);
  }

  saveSyncState(state: CatalogueState): void {
    this.saveSetting(SYNC_KEY, CATALOGUE_STATE.parse(state));
  }

  searchState(): ModelSearchState {
    return this.setting('model-search/order-v1', MODEL_SEARCH_STATE, EMPTY_MODEL_SEARCH_STATE);
  }

  saveSearchState(state: ModelSearchState): void {
    this.saveSetting('model-search/order-v1', MODEL_SEARCH_STATE.parse(state));
  }

  imageEndpoints(): ImageEndpointSnapshot {
    return this.setting('image-endpoints/v1', IMAGE_ENDPOINT_SNAPSHOT, EMPTY_IMAGE_ENDPOINTS);
  }

  saveImageEndpoints(snapshot: ImageEndpointSnapshot): void {
    this.saveSetting('image-endpoints/v1', IMAGE_ENDPOINT_SNAPSHOT.parse(snapshot));
  }

  private upsert(row: AiModelRow): void {
    const updates = COLUMNS.filter((column) => column !== 'id')
      .map((column) => `${column} = excluded.${column}`)
      .join(', ');
    this.context.sql.run(
      'save an AI model',
      `insert into ai_models (${COLUMN_LIST})
        values (${COLUMNS.map((column) => `$${column}`).join(', ')})
        on conflict (id) do update set ${updates}`,
      parametersOf(row),
    );
  }

  private price(row: AiModelRow): void {
    this.context.sql.run(
      'record an AI model price',
      `insert or replace into ai_model_prices (model_id, effective_at, pricing)
        values ($modelId, $at, $pricing)`,
      { modelId: row.id, at: row.synced_at, pricing: jsonText(row.pricing) },
    );
  }

  private markGone(provider: AiModelRow['provider'], present: ReadonlySet<string>): number {
    const now = this.context.now();
    const leaving = this.all().filter(
      (row) => row.provider === provider && row.gone_at === null && !present.has(row.id),
    );
    for (const row of leaving) {
      this.context.sql.run(
        'mark an AI model gone',
        'update ai_models set gone_at = $now where id = $id',
        { now, id: row.id },
      );
    }
    return leaving.length;
  }

  private setting<T>(key: string, schema: z.ZodType<T>, empty: T): T {
    const row = this.context.sql.get(
      STORED_SETTING,
      'select settings from ai_settings where key = $key',
      { key },
    );
    return row === undefined ? empty : schema.parse(row.settings);
  }

  private saveSetting(key: string, value: unknown): void {
    this.context.write(() =>
      this.context.sql.run(
        `save the ${key} AI settings`,
        `insert into ai_settings (key, settings, updated_at) values ($key, $settings, $now)
          on conflict (key) do update set settings = excluded.settings, updated_at = excluded.updated_at`,
        { key, settings: jsonText(value), now: this.context.now() },
      ),
    );
  }
}
