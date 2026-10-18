import {
  AUTO_LATEST_GEMINI_FLASH,
  type AiModelRow,
  type AiResolvedModel,
  type Engine,
} from '@smarteverything/domain';
import { orderedEfforts } from './efforts';

interface ModelPrice {
  readonly inputPerMillion: number | null;
  readonly outputPerMillion: number | null;
  readonly variable: boolean;
}

type Modality = 'text' | 'image' | 'audio' | 'video' | 'file';

export interface ModelChoice {
  readonly id: string;
  readonly name: string;
  readonly provider: string;
  readonly providerLabel: string;
  readonly contextLength: number | null;
  readonly price: ModelPrice;
  readonly efforts: readonly string[];
  readonly latest: boolean;
  readonly inputs: readonly Modality[];
  readonly outputs: readonly Modality[];
  readonly billing?: string;
  readonly supplierLabel?: string;
  readonly catalogueSupplier?: AiModelRow['provider'];
}

export interface ModelPick {
  readonly engine?: Engine;
  readonly model: string;
  readonly effort: string | null;
}

const MODALITIES: ReadonlySet<string> = new Set(['text', 'image', 'audio', 'video', 'file']);

function modalitiesOf(values: readonly string[]): readonly Modality[] {
  return values.filter((value): value is Modality => MODALITIES.has(value));
}

export function choiceOf(row: AiModelRow): ModelChoice {
  return {
    id: row.id,
    name: row.name,
    catalogueSupplier: row.provider,
    supplierLabel: row.provider === 'openrouter' ? 'OpenRouter' : 'Google direct',
    provider: row.author,
    providerLabel: row.author_name,
    contextLength: row.context_length,
    price: {
      inputPerMillion: row.pricing.input_per_mtok,
      outputPerMillion: row.pricing.output_per_mtok,
      variable: row.pricing.variable,
    },
    efforts: orderedEfforts(row.efforts.filter((effort) => effort !== 'none')),
    latest: false,
    inputs: modalitiesOf(row.input_modalities),
    outputs: modalitiesOf(row.output_modalities),
  };
}

export function defaultChoiceOf(
  resolved: AiResolvedModel | null,
  row: AiModelRow | null,
): ModelChoice | null {
  if (resolved === null || row === null) {
    return null;
  }
  return {
    ...choiceOf(row),
    id: AUTO_LATEST_GEMINI_FLASH,
    name: resolved.name,
    latest: resolved.choice === AUTO_LATEST_GEMINI_FLASH,
  };
}

export function keptEffort(model: ModelChoice, effort: string | null): string | null {
  return effort !== null && model.efforts.includes(effort) ? effort : null;
}
