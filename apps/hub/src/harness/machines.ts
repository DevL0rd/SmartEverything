import { randomUUID } from 'node:crypto';
import { ApiError, harnessTargetKey } from '@smarteverything/domain';
import type {
  AiHarnessHost,
  AiHarnessTarget,
  AiMachineList,
  AiMachineSwitchResult,
} from '@smarteverything/domain';
import type { ChatOwner } from '../assistant/chat-directory';
import { OS_NAMES, machineLabel } from './machine-note';
import type { HarnessService } from './service';

function machineId(target: AiHarnessTarget): string {
  return target.kind === 'server' ? 'hub' : target.device_id;
}

function visibleHosts(service: HarnessService, owner: ChatOwner): AiHarnessHost[] {
  return service.directory.visible(owner.role, '');
}

export function listMachines(
  service: HarnessService,
  owner: ChatOwner,
  chatId: string,
): AiMachineList {
  const current = harnessTargetKey(service.binding(service.own(owner, chatId)).execution_target);
  return {
    machines: visibleHosts(service, owner).map((host) => ({
      id: machineId(host.target),
      name: host.name,
      os: OS_NAMES[host.platform],
      ...(host.sandbox === undefined ? {} : { sandbox: host.sandbox }),
      online: host.online,
      current: harnessTargetKey(host.target) === current,
    })),
  };
}

export function resolveMachine(hosts: readonly AiHarnessHost[], wanted: string): AiHarnessHost {
  const key = wanted.trim().toLowerCase();
  const found = hosts.filter(
    (host) => machineId(host.target) === key || host.name.toLowerCase() === key,
  );
  const [only] = found;
  if (only === undefined || found.length > 1)
    throw new ApiError(
      'not_found',
      `${found.length > 1 ? 'More than one machine is called' : 'No machine is called'} ${JSON.stringify(wanted)}. Machines: ${hosts.map(machineLabel).join(', ')}.`,
    );
  return only;
}

export async function switchMachine(
  service: HarnessService,
  owner: ChatOwner,
  chatId: string,
  wanted: string,
): Promise<AiMachineSwitchResult> {
  const host = resolveMachine(visibleHosts(service, owner), wanted);
  const chat = service.own(owner, chatId);
  const result = await service.switch(owner, chatId, {
    operation_id: randomUUID(),
    target: host.target,
    route: service.selection(chat),
  });
  const shown = result.state === 'cleared' ? result.execution_target : host.target;
  return { state: result.state, machine: service.directory.registered(shown).host.name };
}
