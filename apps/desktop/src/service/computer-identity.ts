import { DESKTOP_COMPUTER_IDENTITY, type DesktopComputerIdentity } from '@smarteverything/domain';
import { computerMachineId } from '@smarteverything/hub/node/identity';
import type { ServiceController } from './controller.js';

export async function desktopComputerIdentity(
  service: Pick<ServiceController, 'config' | 'dataDirectory'>,
): Promise<DesktopComputerIdentity> {
  const config = await service.config();
  const hasMachineId = config.role === 'node' || process.platform === 'linux';
  return DESKTOP_COMPUTER_IDENTITY.parse({
    device_id: config.role === 'node' ? config.node.device_id : null,
    machine_id: hasMachineId ? await computerMachineId(service.dataDirectory) : null,
  });
}
