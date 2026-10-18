import type { Logger } from '@smarteverything/logging';

interface Target {
  readonly device_id: string;
  readonly runtime: string;
}

interface Attached {
  readonly local: boolean;
  readonly connectionGeneration: string;
}

function fields(target: Target, attached: Attached, hosts: number): Record<string, unknown> {
  return {
    deviceId: target.device_id,
    runtime: target.runtime,
    local: attached.local,
    connectionGeneration: attached.connectionGeneration,
    hosts,
  };
}

export function runtimeDetached(
  log: Logger,
  target: Target,
  attached: Attached,
  hosts: number,
): void {
  log.info('computer.runtime_detached', fields(target, attached, hosts));
}
