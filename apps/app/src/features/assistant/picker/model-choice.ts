import {
  AUTO_LATEST_GEMINI_FLASH,
  type AiModelRow,
  type AiResolvedModel,
} from '@smarteverything/domain';
import { orderedEfforts } from './efforts';

export interface ModelPrice {
  readonly inputPerMillion: number | null;
  readonly outputPerMillion: number | null;
  readonly variable: boolean;
}

export type Modality = 'text' | 'image' | 'audio' | 'video' | 'file';

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
}

export interface ModelPick {
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

export function autoChoiceOf(
  resolved: AiResolvedModel | null,
  row: AiModelRow | null,
): ModelChoice | null {
  if (resolved === null || row === null || resolved.choice !== AUTO_LATEST_GEMINI_FLASH) {
    return null;
  }
  return { ...choiceOf(row), id: AUTO_LATEST_GEMINI_FLASH, name: resolved.name, latest: true };
}

export function keptEffort(model: ModelChoice, effort: string | null): string | null {
  return effort !== null && model.efforts.includes(effort) ? effort : null;
}
