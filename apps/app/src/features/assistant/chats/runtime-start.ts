import type { ComputerAiRuntime, Engine } from '@smarteverything/domain';
import type { EngineCatalogue, EngineComputer } from '../provider/engine-catalogue';
import { nativeSupplyEngine } from '../provider/subscription-models';

export interface RuntimeChoice {
  readonly key: string;
  readonly name: string;
  readonly reason: string | null;
  readonly engine: Engine | null;
}

export type RuntimeStart =
  | { readonly kind: 'none' }
  | { readonly kind: 'direct'; readonly engine: Engine }
  | { readonly kind: 'menu'; readonly choices: readonly RuntimeChoice[] };

function computersWithRuntime(
  computers: readonly EngineComputer[],
  runtime: ComputerAiRuntime,
): readonly EngineComputer[] {
  return computers.filter((computer) => computer.runtime === runtime && computer.enabled);
}

export function availableRuntimes(
  computers: readonly EngineComputer[],
): ReadonlySet<ComputerAiRuntime> {
  return new Set(computers.filter((computer) => computer.enabled).map((row) => row.runtime));
}

function startModel(
  computer: EngineComputer,
  catalogue: EngineCatalogue,
): EngineComputer['models'][number] | undefined {
  const usable = computer.models.filter((model) => model.available);
  const preferred = catalogue.preferences.find(
    (row) => row.runtime === computer.runtime && row.device_id === computer.device_id,
  )?.model;
  return usable.find((model) => model.id === preferred) ?? usable[0];
}

function unavailableReason(computer: EngineComputer): string {
  if (computer.reason !== null) return computer.reason;
  if (!computer.online) return 'Offline';
  return 'No model available';
}

function choiceOf(computer: EngineComputer, catalogue: EngineCatalogue): RuntimeChoice {
  const model = startModel(computer, catalogue);
  const ready = computer.online && computer.reason === null && model !== undefined;
  return {
    key: `${computer.runtime}:${computer.device_id}`,
    name: computer.name,
    reason: ready ? null : unavailableReason(computer),
    engine: ready ? nativeSupplyEngine({ computer, model }, undefined) : null,
  };
}

export function runtimeStartOf(
  catalogue: EngineCatalogue | undefined,
  runtime: ComputerAiRuntime,
): RuntimeStart {
  if (catalogue === undefined) return { kind: 'none' };
  const choices = computersWithRuntime(catalogue.computers, runtime).map((computer) =>
    choiceOf(computer, catalogue),
  );
  if (choices.length === 0) return { kind: 'none' };
  const ready = choices.filter((choice) => choice.engine !== null);
  const only = ready.length === 1 ? ready[0]?.engine : null;
  return only === null || only === undefined
    ? { kind: 'menu', choices }
    : { kind: 'direct', engine: only };
}
