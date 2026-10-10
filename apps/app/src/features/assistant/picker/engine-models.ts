import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import {
  AUTO_LATEST_GEMINI_FLASH,
  ENGINE_LABELS,
  type AssistantModelInfo,
  type AssistantModels,
  type Engine,
  type EngineKind,
} from '@smarteverything/domain';
import { readEngineModels } from '../../../api/ai';
import { engineModelsKey } from '../../../queries/keys';
import { orderedEfforts } from './efforts';
import { autoChoiceOf, type ModelChoice } from './model-choice';
import { useModelRow, useSuggestedModels } from './model-queries';

export type WorkerEngine = Exclude<EngineKind, 'openrouter'>;

const MAKERS: Readonly<Record<WorkerEngine, readonly [string, string]>> = {
  'claude-session': ['anthropic', 'Anthropic'],
  'codex-thread': ['openai', 'OpenAI'],
};

export const BACKEND_DEFAULT = '';

export function modelOrNull(model: string): string | null {
  return model === BACKEND_DEFAULT || model === AUTO_LATEST_GEMINI_FLASH ? null : model;
}

function choiceOfInfo(kind: WorkerEngine, model: AssistantModelInfo): ModelChoice {
  const [provider, providerLabel] = MAKERS[kind];
  return {
    id: model.id,
    name: model.name,
    provider,
    providerLabel,
    contextLength: null,
    price: { inputPerMillion: null, outputPerMillion: null, variable: false },
    efforts: orderedEfforts(model.efforts),
    latest: false,
    inputs: ['text'],
    outputs: ['text'],
  };
}

function choicesOf(kind: WorkerEngine, list: AssistantModels): readonly ModelChoice[] {
  const unique = list.models.filter(
    (model, index) =>
      model.id !== BACKEND_DEFAULT &&
      list.models.findIndex((other) => other.id === model.id) === index,
  );
  if (unique.length === 0) {
    return [];
  }
  const fallback = { ...list.default_model, id: BACKEND_DEFAULT };
  return [fallback, ...unique].map((model) => choiceOfInfo(kind, model));
}

export interface WorkerModels {
  readonly models: readonly ModelChoice[];
}

export function useWorkerModels(kind: EngineKind): UseQueryResult<WorkerModels> {
  return useQuery({
    queryKey: engineModelsKey(kind),
    queryFn: async (): Promise<WorkerModels> => {
      if (kind === 'openrouter') {
        return { models: [] };
      }
      const list = await readEngineModels(kind);
      return { models: choicesOf(kind, list) };
    },
    enabled: kind !== 'openrouter',
  });
}

function useOpenRouterChoice(model: string | null, enabled: boolean): ModelChoice | null {
  const explicit = enabled && model !== null && model !== AUTO_LATEST_GEMINI_FLASH;
  const row = useModelRow(explicit ? model : null);
  const suggested = useSuggestedModels('chat', null, enabled && !explicit);
  if (explicit) {
    return row.data ?? null;
  }
  const data = suggested.data;
  return data === undefined ? null : autoChoiceOf(data.default, data.default_model);
}

export function useModelChoice(engine: EngineKind, model: string | null): ModelChoice | null {
  const openrouter = useOpenRouterChoice(model, engine === 'openrouter');
  const workers = useWorkerModels(engine);
  if (engine === 'openrouter') {
    return openrouter;
  }
  const id = model ?? BACKEND_DEFAULT;
  return workers.data?.models.find((entry) => entry.id === id) ?? null;
}

export interface ModelLabel {
  readonly name: string;
  readonly provider: string | null;
  readonly providerLabel: string | null;
}

export function useModelLabel(engine: Engine): ModelLabel {
  const model = useModelChoice(engine.kind, engine.model);
  return model === null
    ? { name: ENGINE_LABELS[engine.kind], provider: null, providerLabel: null }
    : { name: model.name, provider: model.provider, providerLabel: model.providerLabel };
}
