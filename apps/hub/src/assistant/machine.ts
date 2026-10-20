import type { ClientRow, SightSource } from '@smarteverything/domain';
import type { Store } from '../store/store';

export type MachineKind = 'phone' | 'tablet' | 'computer' | 'web browser' | 'camera';

export interface Machine {
  readonly name: string;
  readonly kind: MachineKind;
  readonly room: string | null;
}

const KINDS: Readonly<Record<ClientRow['kind'], MachineKind>> = {
  computer: 'computer',
  phone: 'phone',
  tablet: 'tablet',
  browser: 'web browser',
};

const OWN_SCREENS: Readonly<Record<MachineKind, SightSource | null>> = {
  phone: 'phone_screen',
  tablet: 'phone_screen',
  computer: 'desktop_screen',
  'web browser': 'desktop_screen',
  camera: null,
};

export function machineOfClient(store: Store, client: ClientRow): Machine {
  return {
    name: client.name,
    kind: KINDS[client.kind],
    room: client.platform === 'desktop' ? store.computerNodes.roomOfWindow(client.id) : null,
  };
}

export function machineLabel(machine: Machine): string {
  return `${machine.name} (${machine.kind})${machine.room === null ? '' : `, ${machine.room}`}`;
}

export function ownScreenOf(machine: Machine | null): SightSource | null {
  return machine === null ? null : OWN_SCREENS[machine.kind];
}

export function ownScreenRule(machine: Machine): string | null {
  const source = ownScreenOf(machine);
  if (source === null) {
    return null;
  }
  return `This call comes from ${machine.name}, a ${machine.kind}. When they say my screen, this screen, look at my screen or what I am looking at, they mean the screen of ${machine.name}: look at ${source}. Look at the screen of another device only when they name that device.`;
}
