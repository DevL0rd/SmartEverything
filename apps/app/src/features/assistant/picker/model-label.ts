import { useHarnessCatalogue } from '../data/harness';
import { harnessHostName } from '../model/harness-context';
import { COMPUTER_ENGINE_LABELS, type ComputerEngine } from '../provider/computer-engine';
import {
  AUTO_LATEST_GEMINI_FLASH,
  AI_MODEL_CHOICE,
  type Engine,
  type DshEngine,
  type AiHarnessCatalogue,
} from '@smarteverything/domain';
import { useEngineCatalogue } from '../provider/provider-data';
import type { EngineCatalogue } from '../provider/engine-catalogue';
import { defaultChoiceOf, type ModelChoice } from './model-choice';
import { useModelRow, useSuggestedModels } from './model-queries';

export function useModelChoice(model: string | null): ModelChoice | null {
  const explicit = model !== null && model !== AUTO_LATEST_GEMINI_FLASH;
  const row = useModelRow(explicit && AI_MODEL_CHOICE.safeParse(model).success ? model : null);
  const suggested = useSuggestedModels('chat', null, !explicit);
  if (explicit) {
    return row.data ?? null;
  }
  const data = suggested.data;
  return data === undefined ? null : defaultChoiceOf(data.default, data.default_model);
}

export interface ModelLabel {
  readonly name: string;
  readonly provider: string | null;
  readonly providerLabel: string | null;
  readonly computer: string | null;
}

export function useModelLabel(engine: Engine): ModelLabel {
  const catalogue = useEngineCatalogue();
  const harness = useHarnessCatalogue();
  if (engine.kind === 'dsh') return harnessModelLabel(engine, harness.data);
  return nativeModelLabel(engine, catalogue.data);
}

function nativeModelLabel(
  engine: ComputerEngine,
  catalogue: EngineCatalogue | undefined,
): ModelLabel {
  const computer = catalogue?.computers.find(
    (row) => row.device_id === engine.device_id && row.runtime === engine.kind,
  );
  const native = computer?.models.find((row) => row.id === engine.model);
  return {
    name: native?.name ?? engine.model,
    provider: COMPUTER_ENGINE_LABELS[engine.kind].provider,
    providerLabel: COMPUTER_ENGINE_LABELS[engine.kind].subscription,
    computer: computer?.name ?? 'Computer unavailable',
  };
}

function harnessModelLabel(
  engine: DshEngine,
  catalogue: AiHarnessCatalogue | undefined,
): ModelLabel {
  const route = catalogue?.routes.find((row) => row.id === engine.model_route_id);
  return {
    name: route?.models.find((row) => row.id === engine.model)?.name ?? engine.model,
    provider: route?.auth.provider ?? null,
    providerLabel: route?.auth.provider ?? null,
    computer:
      route === undefined ? 'Supplier unavailable' : harnessHostName(route.supplier, catalogue),
  };
}
