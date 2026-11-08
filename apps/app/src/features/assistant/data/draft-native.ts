import { NATIVE_DEFAULT_MODEL, type ComputerAiRuntime, type Engine } from '@smarteverything/domain';
import type { EngineCatalogue, EngineComputer } from '../provider/engine-catalogue';
import { isComputerEngine, type ComputerEngine } from '../provider/computer-engine';
import {
  nativeSupplyOptionReason,
  nativeSupplyEngine,
  type NativeSupply,
} from '../provider/subscription-models';

export const NATIVE_CATALOGUE_CHECKING = 'Checking connected computers…';

function preferredNativeSupply(
  catalogue: EngineCatalogue,
  computer: EngineComputer,
  previous: Engine,
): NativeSupply | null {
  const supplies = computer.models
    .map((model) => ({ computer, model }))
    .filter((supply) => nativeSupplyOptionReason(supply, previous) === null);
  if (
    isComputerEngine(previous) &&
    previous.kind === computer.runtime &&
    previous.device_id === computer.device_id
  ) {
    const selected = supplies.find((supply) => supply.model.id === previous.model);
    if (selected !== undefined) return selected;
  }
  const preferred = supplies.find(({ model }) =>
    catalogue.preferences.some(
      (row) =>
        row.runtime === computer.runtime &&
        row.device_id === computer.device_id &&
        row.model === model.id,
    ),
  );
  return (
    preferred ??
    supplies.find(({ model }) => model.id === NATIVE_DEFAULT_MODEL) ??
    supplies[0] ??
    null
  );
}

export function nativeDraftEngine(
  catalogue: EngineCatalogue,
  computer: EngineComputer,
  previous: Engine,
): ComputerEngine {
  const supply = preferredNativeSupply(catalogue, computer, previous);
  if (supply !== null) return nativeSupplyEngine(supply, previous);
  if (
    isComputerEngine(previous) &&
    previous.kind === computer.runtime &&
    previous.device_id === computer.device_id
  )
    return previous;
  const binding = { device_id: computer.device_id, model: NATIVE_DEFAULT_MODEL, effort: null };
  return computer.runtime === 'claude'
    ? { ...binding, kind: 'claude', settings: computer.provider_options }
    : { ...binding, kind: 'codex', settings: computer.provider_options };
}

export function nativeComputer(
  computers: readonly EngineComputer[] | undefined,
  runtime: ComputerAiRuntime,
  deviceId: string,
): EngineComputer | undefined {
  return computers?.find((row) => row.runtime === runtime && row.device_id === deviceId);
}

export function nativeNeedsFolder(computer: EngineComputer, engine: Engine): boolean {
  if (computer.provider_options.cwd !== undefined) return false;
  if (
    isComputerEngine(engine) &&
    engine.kind === computer.runtime &&
    engine.device_id === computer.device_id &&
    engine.settings.cwd !== undefined
  )
    return false;
  return (
    computer.runtime === 'codex' ||
    !('capabilities' in computer) ||
    computer.capabilities.managed_projects?.protocol !== 1
  );
}
