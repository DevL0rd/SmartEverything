import {
  computerGuardBlocks,
  isHubOwnUnit,
  type ComputerRole,
  type NodeRequest,
} from '@smarteverything/domain';

export interface HubGuardTarget {
  readonly role: ComputerRole;
  readonly hubPid: number;
}

function stopsHub(request: NodeRequest, hubPid: number): boolean {
  if (request.verb === 'service_set') {
    const { unit, operation } = request.change;
    return (
      isHubOwnUnit(unit) && computerGuardBlocks('hub', { kind: 'own_service', operation }, false)
    );
  }
  return (
    request.verb === 'signal' &&
    request.pid === hubPid &&
    computerGuardBlocks('hub', { kind: 'own_process', signal: request.signal }, false)
  );
}

export function hubAllows(
  request: NodeRequest,
  { role, hubPid }: HubGuardTarget,
  confirmed: boolean,
): boolean {
  return confirmed || role !== 'hub' || !stopsHub(request, hubPid);
}
