import {
  CAPABILITY_CATALOGUE,
  COMPUTER_ROLE_MODELS,
  type ComputerAction,
  type ComputerRole,
  type DeviceCapability,
  type DiscoveredDevice,
  type MachineAction,
  type NodeHello,
} from '@smarteverything/domain';
import { driverDeviceId } from '../local/device-driver';
import { machineCapabilities } from '../machines/machine-capabilities';

export const COMPUTER_DRIVER = 'computer';

export function computerExternalId(machineId: string): string {
  return driverDeviceId(COMPUTER_DRIVER, machineId);
}

function actionCapability(action: ComputerAction): DeviceCapability {
  return {
    key: action,
    label: CAPABILITY_CATALOGUE[action].label,
    access: 'write',
    value: { kind: 'action' },
  };
}

export interface ComputerControlSet {
  readonly power: readonly ComputerAction[];
  readonly machine: readonly MachineAction[];
}

export function describeComputer(
  hello: NodeHello,
  role: ComputerRole,
  readings: readonly DeviceCapability[],
  controls: ComputerControlSet,
): DiscoveredDevice {
  return {
    provider: 'local',
    externalId: computerExternalId(hello.machineId),
    parentExternalId: null,
    kind: 'computer',
    name: hello.hostname,
    model: COMPUTER_ROLE_MODELS[role],
    manufacturer: hello.hardware.vendor ?? hello.os.name,
    room: null,
    online: true,
    capabilities: [
      ...readings,
      ...controls.power.map(actionCapability),
      ...machineCapabilities(hello.actions, controls.machine),
    ],
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
