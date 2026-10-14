import { harnessTargetKey, type Engine } from '@smarteverything/domain';
import { useDesktopHarness } from './desktop-harness';
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
  const local = useDesktopHarness();
  const choice = accessory?.host;
  if (isComputerEngine(engine) || (choice?.draft !== true && engine.kind !== 'openrouter'))
    return { engine, reason: null, resolve: (): Engine => engine };
  const target = local.desktop ? local.target : ({ kind: 'server' } as const);
  const key = selectedKey(choice, target);
  const host = catalogue.data?.hosts.find((row) => harnessTargetKey(row.target) === key);
  const selected = host === undefined ? null : select(host);
  return {
    engine: selected,
    reason: selected === null ? draftExecutionReason() : null,
    resolve: (): Engine | null => {
      if (!choiceReady(choice) || host === undefined) return null;
      return select(host, true);
    },
  };
}
function draftExecutionReason(): string {
  return 'The selected machine, model or permissions are unavailable. Check Machine before sending.';
}

function selectedKey(
  choice: { readonly draft: boolean; readonly key: string } | undefined,
  target: ReturnType<typeof useDesktopHarness>['target'],
): string | null {
  if (choice?.draft === true) return choice.key;
  return target === null ? null : harnessTargetKey(target);
}
function choiceReady(
  choice: { readonly draft: boolean; readonly valid: () => boolean } | undefined,
): boolean {
  return choice?.draft !== true || choice.valid();
}
