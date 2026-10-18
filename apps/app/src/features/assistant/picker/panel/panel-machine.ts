import {
  harnessTargetKey,
  type AiHarnessCatalogue,
  type DshEngine,
  type Engine,
} from '@smarteverything/domain';
import { useIsOwner } from '../../../../store/selectors';
import { useEngineAccessory } from '../../chats/engine-accessories';
import { useChatHarness, useHarnessCatalogue } from '../../data/harness';
import { harnessHostReason } from '../../model/harness-context';
import { isComputerEngine, type ComputerEngine } from '../../provider/computer-engine';
import type { EngineCatalogue, EngineComputer } from '../../provider/engine-catalogue';
import { useEngineCatalogue } from '../../provider/provider-data';
import { HUB_SOURCE } from '../library/library-sources';

type MachineHealth =
  | { readonly kind: 'unknown' }
  | { readonly kind: 'online' }
  | { readonly kind: 'offline' }
  | { readonly kind: 'problem'; readonly reason: string };

export interface MachineFacts {
  readonly id: string;
  readonly health: MachineHealth;
  readonly folder: string | null;
  readonly deviceId: string | null;
  readonly canChooseFolder: boolean;
}

export interface MachineLine {
  readonly text: string;
  readonly warning: boolean;
}

export function folderName(path: string | null): string | null {
  const segment = path?.split(/[\\/]/u).findLast((part) => part.length > 0);
  return segment === undefined || segment === '~' ? null : segment;
}

export function machineLine(facts: Pick<MachineFacts, 'health' | 'folder'>): MachineLine {
  const { health } = facts;
  if (health.kind === 'offline') return { text: 'Offline', warning: true };
  if (health.kind === 'problem') return { text: health.reason, warning: true };
  if (health.kind === 'unknown') return { text: 'Checking…', warning: false };
  const folder = folderName(facts.folder);
  return { text: folder === null ? 'Online' : `Online · ${folder}`, warning: false };
}

export function engineMachineId(engine: Engine): string {
  if (engine.kind === 'dsh') return harnessTargetKey(engine.execution_target);
  return isComputerEngine(engine) ? `device:${engine.device_id}` : HUB_SOURCE;
}

function healthOf(online: boolean, problem: string | null): MachineHealth {
  if (!online) return { kind: 'offline' };
  return problem === null ? { kind: 'online' } : { kind: 'problem', reason: problem };
}

interface FactSources {
  readonly harness: AiHarnessCatalogue | undefined;
  readonly engines: EngineCatalogue | undefined;
  readonly owner: boolean;
  readonly bound: boolean;
  readonly directory: string | null;
}

function harnessFacts(engine: DshEngine, id: string, sources: FactSources): MachineFacts {
  const host = sources.harness?.hosts.find((entry) => harnessTargetKey(entry.target) === id);
  const deviceId =
    engine.execution_target.kind === 'device' ? engine.execution_target.device_id : null;
  return {
    id,
    health:
      host === undefined ? { kind: 'unknown' } : healthOf(host.online, harnessHostReason(host)),
    folder: id === HUB_SOURCE ? null : sources.directory,
    deviceId,
    canChooseFolder: sources.owner && sources.bound && deviceId !== null && host?.online === true,
  };
}

export function computerFacts(
  engine: ComputerEngine,
  computer: Pick<EngineComputer, 'online' | 'reason'> | undefined,
  owner: boolean,
): MachineFacts {
  return {
    id: engineMachineId(engine),
    health:
      computer === undefined ? { kind: 'unknown' } : healthOf(computer.online, computer.reason),
    folder: engine.settings.cwd ?? null,
    deviceId: engine.device_id,
    canChooseFolder: owner && computer?.online === true,
  };
}

function factsOf(engine: Engine, sources: FactSources): MachineFacts {
  const id = engineMachineId(engine);
  if (engine.kind === 'dsh') return harnessFacts(engine, id, sources);
  if (isComputerEngine(engine))
    return computerFacts(
      engine,
      sources.engines?.computers.find(
        (entry) => entry.runtime === engine.kind && entry.device_id === engine.device_id,
      ),
      sources.owner,
    );
  return { id, health: { kind: 'online' }, folder: null, deviceId: null, canChooseFolder: false };
}

export function useMachineFacts(engine: Engine): MachineFacts {
  const harness = useHarnessCatalogue().data;
  const engines = useEngineCatalogue().data;
  const owner = useIsOwner();
  const chat = useEngineAccessory()?.chat;
  const bound = chat?.engine.kind === 'dsh' && chat.engine.session_id !== null;
  const directory = useChatHarness(chat?.id ?? '', bound).data?.directory?.path ?? null;
  return factsOf(engine, { harness, engines, owner, bound, directory });
}
