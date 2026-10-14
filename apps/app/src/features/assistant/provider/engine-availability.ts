import { useHarnessCatalogue, useHarnessSupportReason } from '../data/harness';
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
  const supportReason = useHarnessSupportReason();
  const catalogue = useEngineCatalogue();
  if (engine.kind === 'dsh')
    return supportReason ?? harness.error?.message ?? harnessEngineReason(engine, harness.data);
  if (!isComputerEngine(engine)) return null;
  if (!owner) return NATIVE_OWNER_REASON;
  if (catalogue.data === undefined)
    return catalogue.error?.message ?? 'Loading the supplying computer’s availability…';
  const computer = catalogue.data.computers.find(
    (entry) => entry.device_id === engine.device_id && entry.runtime === engine.kind,
  );
  return computerReason(computer, engine.model);
}
function computerReason(computer: EngineComputer | undefined, modelId: string): string | null {
  if (computer === undefined)
    return 'The supplying computer is unavailable. This chat keeps its computer and model binding.';
  if (!computer.online) return computer.reason ?? 'The supplying computer is offline.';
  if (!computer.enabled || computer.reason !== null)
    return (
      computer.reason ??
      `Enable the ${COMPUTER_ENGINE_LABELS[computer.runtime].name} provider on the supplying computer.`
    );
  return modelReason(computer, modelId);
}
function modelReason(computer: EngineComputer, modelId: string): string | null {
  const model = computer.models.find((entry) => entry.id === modelId);
  if (model?.available === true) return null;
  return model?.reason ?? 'The configured model is unavailable on this computer.';
}
