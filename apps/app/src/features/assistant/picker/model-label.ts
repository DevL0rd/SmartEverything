import { AUTO_LATEST_GEMINI_FLASH, type Engine } from '@smarteverything/domain';
import { autoChoiceOf, type ModelChoice } from './model-choice';
import { useModelRow, useSuggestedModels } from './model-queries';

const LOADING_NAME = 'OpenRouter';

export function modelOrNull(model: string): string | null {
  return model === AUTO_LATEST_GEMINI_FLASH ? null : model;
}

export function useModelChoice(model: string | null): ModelChoice | null {
  const explicit = model !== null && model !== AUTO_LATEST_GEMINI_FLASH;
  const row = useModelRow(explicit ? model : null);
  const suggested = useSuggestedModels('chat', null, !explicit);
  if (explicit) {
    return row.data ?? null;
  }
  const data = suggested.data;
  return data === undefined ? null : autoChoiceOf(data.default, data.default_model);
}

export interface ModelLabel {
  readonly name: string;
  readonly provider: string | null;
  readonly providerLabel: string | null;
}

export function useModelLabel(engine: Engine): ModelLabel {
  const model = useModelChoice(engine.model);
  return model === null
    ? { name: LOADING_NAME, provider: null, providerLabel: null }
    : { name: model.name, provider: model.provider, providerLabel: model.providerLabel };
}
