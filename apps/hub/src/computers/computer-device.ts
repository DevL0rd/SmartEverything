import {
  CAPABILITY_CATALOGUE,
  type ComputerAction,
  type DeviceCapability,
  type DiscoveredDevice,
  type NodeHello,
} from '@smarteverything/domain';
import { driverDeviceId } from '../local/device-driver';

export const COMPUTER_DRIVER = 'computer';

export const COMPUTER_MODEL = 'smarteverything.computer';

export function computerExternalId(hello: NodeHello): string {
  return driverDeviceId(COMPUTER_DRIVER, hello.machineId);
}

function actionCapability(action: ComputerAction): DeviceCapability {
  return {
    key: action,
    label: CAPABILITY_CATALOGUE[action].label,
    access: 'write',
    value: { kind: 'action' },
  };
}

export function describeComputer(
  hello: NodeHello,
  readings: readonly DeviceCapability[],
  actions: readonly ComputerAction[],
): DiscoveredDevice {
  return {
    provider: 'local',
    externalId: computerExternalId(hello),
    parentExternalId: null,
    kind: 'computer',
    name: hello.hostname,
    model: COMPUTER_MODEL,
    manufacturer: hello.hardware.vendor ?? hello.os.name,
    room: null,
    online: true,
    capabilities: [...readings, ...actions.map(actionCapability)],
    details: {
      product: hello.hardware.product,
      portable: hello.hardware.portable,
      os: hello.os.name,
      kernel: hello.os.kernel,
      processor: hello.cpu.model,
      threads: hello.cpu.threads,
      memoryBytes: hello.memoryBytes,
      interfaces: hello.interfaces.map((item) => ({ name: item.name, mac: item.mac })),
    },
  };
}
