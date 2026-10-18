import { useHarnessCatalogue } from '../data/harness';
import { harnessEngineReason } from '../model/harness-context';
import type { Engine } from '@smarteverything/domain';
import { isComputerEngine, COMPUTER_ENGINE_LABELS } from './computer-engine';
import type { EngineComputer } from './engine-catalogue';
import { useIsOwner } from '../../../store/selectors';
import { useEngineCatalogue } from './provider-data';
import { NATIVE_OWNER_REASON } from './provider-access';
export function useEngineUnavailableReason(engine: Engine): string | null {
  const owner = useIsOwner();
  const harness = useHarnessCatalogue();
  const catalogue = useEngineCatalogue();
  if (engine.kind === 'dsh')
    return harness.error?.message ?? harnessEngineReason(engine, harness.data);
  if (!isComputerEngine(engine)) return null;
  if (!owner) return NATIVE_OWNER_REASON;
  if (catalogue.data === undefined) return catalogue.error?.message ?? 'Checking this computer…';
  const computer = catalogue.data.computers.find(
    (entry) => entry.device_id === engine.device_id && entry.runtime === engine.kind,
  );
  return computerReason(computer, engine.model);
}
function computerReason(computer: EngineComputer | undefined, modelId: string): string | null {
  if (computer === undefined) return 'This computer is offline. The chat stays on this computer.';
  if (!computer.online) return computer.reason ?? 'This computer is offline.';
  if (!computer.enabled || computer.reason !== null)
    return (
      computer.reason ??
      `Turn on ${COMPUTER_ENGINE_LABELS[computer.runtime].name} on this computer.`
    );
  return modelReason(computer, modelId);
}
function modelReason(computer: EngineComputer, modelId: string): string | null {
  const model = computer.models.find((entry) => entry.id === modelId);
  if (model?.available === true) return null;
  return model?.reason ?? 'The configured model is unavailable on this computer.';
}
