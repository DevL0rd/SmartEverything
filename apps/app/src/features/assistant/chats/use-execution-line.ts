import {
  harnessTargetKey,
  type AiChatRow,
  type AiHarnessCatalogue,
  type AiHarnessTarget,
} from '@smarteverything/domain';
import { useCancelMachineSwitch } from '../data/harness-device';
import { useIsOwner } from '../../../store/selectors';
import { useChatHarness, useHarnessCatalogue } from '../data/harness';
import {
  executionFolderPath,
  executionLineOf,
  type ExecutionFacts,
  type ExecutionLine,
} from '../model/chat-footer';
import { machineSwitchOf } from '../model/harness-handoff';
import { harnessHostName } from '../model/harness-context';
import {
  COMPUTER_ENGINE_LABELS,
  isComputerEngine,
  type ComputerEngine,
} from '../provider/computer-engine';
import { useCodexProvider } from '../provider/codex-provider-data';
import { useEngineCatalogue } from '../provider/provider-data';

const HOME_HUB = 'Home Hub';

const HOME_FACTS: ExecutionFacts = {
  runtime: null,
  host: HOME_HUB,
  path: null,
  offline: false,
  switchingTo: null,
};

function hostLabel(target: AiHarnessTarget, catalogue: AiHarnessCatalogue | undefined): string {
  return target.kind === 'server' ? HOME_HUB : harnessHostName(target, catalogue);
}

function hostOffline(target: AiHarnessTarget, catalogue: AiHarnessCatalogue | undefined): boolean {
  const key = harnessTargetKey(target);
  const host = catalogue?.hosts.find((entry) => harnessTargetKey(entry.target) === key);
  return host !== undefined && !host.online;
}

function useHarnessFacts(chat: AiChatRow): ExecutionFacts | null {
  const engine = chat.engine;
  const session = useChatHarness(chat.id, engine.kind === 'dsh' && engine.session_id !== null).data;
  const catalogue = useHarnessCatalogue().data;
  if (engine.kind !== 'dsh') return null;
  const target = engine.execution_target;
  const moving = machineSwitchOf(chat.pending_execution_target);
  return {
    runtime: null,
    host: hostLabel(target, catalogue),
    path: executionFolderPath(target, session?.directory?.path ?? null),
    offline: hostOffline(target, catalogue),
    switchingTo: moving.kind === 'idle' ? null : hostLabel(moving.target, catalogue),
  };
}

function nativePath(engine: ComputerEngine, codexPath: string | null): string | null {
  return engine.kind === 'codex' ? codexPath : (engine.settings.cwd ?? null);
}

function useComputerFacts(chat: AiChatRow): ExecutionFacts | null {
  const owner = useIsOwner();
  const engine = chat.engine;
  const catalogue = useEngineCatalogue().data;
  const codex = useCodexProvider(chat.id, owner && engine.kind === 'codex').data;
  if (!isComputerEngine(engine)) return null;
  const computer = catalogue?.computers.find(
    (entry) => entry.runtime === engine.kind && entry.device_id === engine.device_id,
  );
  return {
    runtime: COMPUTER_ENGINE_LABELS[engine.kind].name,
    host: computer?.name ?? 'Computer',
    path: nativePath(engine, codex?.context?.cwd ?? null),
    offline: false,
    switchingTo: null,
  };
}

export function useExecutionLine(chat: AiChatRow): ExecutionLine {
  const harness = useHarnessFacts(chat);
  const computer = useComputerFacts(chat);
  const cancel = useCancelMachineSwitch(chat);
  return { ...executionLineOf(harness ?? computer ?? HOME_FACTS), cancel };
}
