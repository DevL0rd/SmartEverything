import { readFile } from 'node:fs/promises';
import { DESKTOP_COMPUTER_IDENTITY, type DesktopComputerIdentity } from '@smarteverything/domain';
import type { ServiceController } from './controller.js';

export async function desktopComputerIdentity(
  service: ServiceController,
): Promise<DesktopComputerIdentity> {
  const config = await service.config();
  const machineId =
    process.platform === 'linux' ? (await readFile('/etc/machine-id', 'utf8')).trim() : null;
  return DESKTOP_COMPUTER_IDENTITY.parse({
    device_id: config.role === 'node' ? config.node.device_id : null,
    machine_id: machineId,
  });
}
