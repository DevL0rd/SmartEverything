import {
  ApiError,
  PHOTO_AI_MODEL_ROLES,
  type AiModelRow,
  type PhotoAiModelCatalogue,
  type PhotoAiModelChoice,
  type PhotoAiModelRole,
  type PhotoAiModelsUpdate,
} from '@smarteverything/domain';
import type { AiModelsState } from '../../store/ai-models-state';

export interface CatalogueStore {
  readonly aiModels: Pick<AiModelsState, 'all'>;
}

export type ZdrModelIds = () => Promise<ReadonlySet<string>>;

const FITS: Readonly<Record<PhotoAiModelRole, (row: AiModelRow) => boolean>> = {
  vision: (row) =>
    row.kinds.includes('chat') &&
    row.input_modalities.includes('image') &&
    row.output_modalities.includes('text'),
  embedding: (row) => row.kinds.includes('embed'),
  petEmbedding: (row) => row.kinds.includes('embed') && row.input_modalities.includes('image'),
  eraser: (row) => row.kinds.includes('image') && row.input_modalities.includes('image'),
};

function choiceOf(row: AiModelRow): PhotoAiModelChoice {
  return {
    id: row.id,
    name: row.name,
    author: row.author_name,
    contextLength: row.context_length,
    inputPerMtok: row.pricing.variable ? null : row.pricing.input_per_mtok,
  };
}

export class PhotoModelCatalogue {
  constructor(
    private readonly store: CatalogueStore,
    private readonly zdr: ZdrModelIds,
  ) {}

  async read(): Promise<PhotoAiModelCatalogue> {
    const keeping = await this.zdr();
    const rows = this.store.aiModels
      .all()
      .filter((row) => row.provider === 'openrouter' && row.gone_at === null && keeping.has(row.id))
      .sort(
        (left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id),
      );
    return {
      vision: rows.filter(FITS.vision).map(choiceOf),
      embedding: rows.filter(FITS.embedding).map(choiceOf),
      petEmbedding: rows.filter(FITS.petEmbedding).map(choiceOf),
      eraser: rows.filter(FITS.eraser).map(choiceOf),
    };
  }

  async require(update: PhotoAiModelsUpdate): Promise<void> {
    const catalogue = await this.read();
    for (const role of PHOTO_AI_MODEL_ROLES) {
      const id = update[role];
      if (id !== undefined && !catalogue[role].some((choice) => choice.id === id)) {
        throw new ApiError(
          'invalid_request',
          `${id} is not a model that can be used for ${role}: it must take the input this feature needs and keep no data.`,
        );
      }
    }
  }
}
