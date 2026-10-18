import { harnessTargetKey, type Engine } from '@smarteverything/domain';
import { useDesktopHarness } from './desktop-harness';
import { useHarnessCatalogue } from './harness';
import { useOpenRouterStatus } from './openrouter';
import { useOwnDeviceSelection } from './own-device-selection';
import { useEngineAccessory } from '../chats/engine-accessories';
import { engineUsesOpenRouter, type DraftReadiness } from '../model/draft-chat-request';
import { isComputerEngine } from '../provider/computer-engine';
import { useEngineUnavailableReason } from '../provider/engine-availability';
import { useEngineCatalogue } from '../provider/provider-data';

const DRAFT_EXECUTION_REASON =
  'The selected machine, model or permissions are unavailable. Check Machine before sending.';

export interface DraftExecution {
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
    reason: selected === null ? DRAFT_EXECUTION_REASON : null,
    resolve: (): Engine | null => {
      if (!choiceReady(choice) || host === undefined) return null;
      return select(host, true);
    },
  };
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

export function useDraftKeyNeeded(engine: Engine): boolean {
  const routes = useHarnessCatalogue().data?.routes ?? [];
  return useOpenRouterStatus().data?.key === 'missing' && engineUsesOpenRouter(engine, routes);
}

export function useDraftReadiness(draft: {
  readonly engine: Engine;
  readonly ready: boolean;
  readonly execution: DraftExecution;
  readonly needsKey: boolean;
}): DraftReadiness {
  const local = useDesktopHarness();
  const loaded = useEngineCatalogue().data !== undefined;
  const unavailable = useEngineUnavailableReason(draft.execution.engine ?? draft.engine);
  return {
    loading: !draft.ready,
    runtimeStopped: !draft.ready && loaded && local.desktop && local.target === null,
    needsKey: draft.needsKey,
    blocked: unavailable ?? draft.execution.reason,
  };
}
