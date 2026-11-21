import type {
  ComputerAction,
  ComputerParts,
  ComputerRole,
  ComputerScopes,
  DiscoveredDevice,
  NodeHello,
} from '@smarteverything/domain';
import { describeComputer, type ComputerIdentity } from './computer-device';
import { headlineCapabilities } from './headlines';
import { offeredMachineActions } from './machine-requests';
import { sessionCapabilities } from './session-readings';

export interface SessionDeviceInput {
  readonly hello: NodeHello;
  readonly latest: ComputerParts;
  readonly scopes: ComputerScopes | null;
  readonly power: ComputerAction[];
  readonly identity: ComputerIdentity | undefined;
}

export function powerActions(
  hello: NodeHello,
  scopes: ComputerScopes | null,
  role: ComputerRole,
): ComputerAction[] {
  if (scopes?.power !== true) return [];
  const wake = role === 'pc' && hello.interfaces.length > 0 ? ['wake' as const] : [];
  return [...hello.power, ...wake];
}

export function sessionDevice(input: SessionDeviceInput): DiscoveredDevice {
  const { summary, session } = input.latest;
  const readings = [
    ...(summary === undefined ? [] : headlineCapabilities(summary)),
    ...sessionCapabilities(session ?? null, input.scopes?.apps === true),
  ];
  return describeComputer(input.hello, readings, {
    power: input.power,
    machine: offeredMachineActions(input.scopes),
    ...(input.identity === undefined ? {} : { identity: input.identity }),
  });
}
