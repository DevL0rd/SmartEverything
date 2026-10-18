import { BlockList } from 'node:net';
import { lanInterfaces } from '../../../network/lan';

export interface WizInterface {
  readonly address: string;
  readonly prefix: number;
  readonly broadcast: string;
}

const ADDRESS_BITS = 32;
const OCTET = 256;
const OCTET_SHIFTS = [24, 16, 8, 0] as const;

function addressNumber(address: string): number {
  return address.split('.').reduce((total, part) => total * OCTET + Number(part), 0);
}

function broadcastOf(address: string, prefix: number): string {
  const size = 2 ** (ADDRESS_BITS - prefix);
  const last = Math.floor(addressNumber(address) / size) * size + size - 1;
  return OCTET_SHIFTS.map((shift) => Math.floor(last / 2 ** shift) % OCTET).join('.');
}

export function wizInterfaces(): readonly WizInterface[] {
  return lanInterfaces().map(({ address, prefix }) => ({
    address,
    prefix,
    broadcast: broadcastOf(address, prefix),
  }));
}

export function interfaceFor(
  address: string,
  interfaces: readonly WizInterface[],
): WizInterface | undefined {
  return interfaces.find((entry) => {
    const subnet = new BlockList();
    subnet.addSubnet(entry.address, entry.prefix);
    return subnet.check(address);
  });
}
