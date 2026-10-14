import { harnessTargetKey, type Engine } from '@smarteverything/domain';
import { useHarnessCatalogue } from './harness';
import { useOwnDeviceSelection } from './own-device-selection';
import { useEngineAccessory } from '../chats/engine-accessories';
import { isComputerEngine } from '../provider/computer-engine';

interface DraftExecution {
  readonly engine: Engine | null;
  readonly reason: string | null;
  readonly resolve: () => Engine | null;
}
export function useDraftExecution(engine: Engine): DraftExecution {
  const accessory = useEngineAccessory();
  const catalogue = useHarnessCatalogue();
  const select = useOwnDeviceSelection(engine);
  const choice = accessory?.host;
  if (choice?.draft !== true || isComputerEngine(engine))
    return { engine, reason: null, resolve: (): Engine => engine };
  const host = catalogue.data?.hosts.find((row) => harnessTargetKey(row.target) === choice.key);
  const selected = host === undefined ? null : select(host);
  return {
    engine: selected,
    reason: selected === null ? draftExecutionReason() : null,
    resolve: (): Engine | null => {
      if (!choice.valid() || host === undefined) return null;
      return select(host, true);
    },
  };
}
function draftExecutionReason(): string {
  return 'The selected machine, model or permissions are unavailable. Check Machine before sending.';
}
