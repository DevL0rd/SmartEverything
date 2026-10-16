import { networkInterfaces } from 'node:os';
import { BlockList } from 'node:net';
import { z } from 'zod';

export interface WizInterface {
  readonly address: string;
  readonly netmask: string;
  readonly mac: string;
  readonly broadcast: string;
}
const IPV4_PARTS = z.array(z.coerce.number().int().min(0).max(255)).length(4);
function broadcastOf(address: string, netmask: string): string {
  const addressBytes = IPV4_PARTS.parse(address.split('.'));
  const maskBytes = IPV4_PARTS.parse(netmask.split('.'));
  return addressBytes
    .map((part, index) => part | (255 ^ z.number().parse(maskBytes[index])))
    .join('.');
}
export function wizInterfaces(): readonly WizInterface[] {
  return Object.values(networkInterfaces()).flatMap((entries) =>
    (entries ?? [])
      .filter((entry) => !entry.internal && entry.family === 'IPv4')
      .map((entry) => ({
        address: entry.address,
        netmask: entry.netmask,
        mac: entry.mac.replaceAll(':', ''),
        broadcast: broadcastOf(entry.address, entry.netmask),
      })),
  );
}
function numeric(address: string): number {
  return IPV4_PARTS.parse(address.split('.')).reduce((result, part) => result * 256 + part, 0);
}
export function interfaceFor(
  address: string,
  interfaces: readonly WizInterface[],
): WizInterface | undefined {
  const parsed = z.ipv4().safeParse(address);
  if (!parsed.success) return undefined;
  const remote = numeric(parsed.data);
  return interfaces.find(
    (entry) =>
      (remote & numeric(entry.netmask)) === (numeric(entry.address) & numeric(entry.netmask)),
  );
}
const PRIVATE = new BlockList();
PRIVATE.addSubnet('10.0.0.0', 8);
PRIVATE.addSubnet('172.16.0.0', 12);
PRIVATE.addSubnet('192.168.0.0', 16);
PRIVATE.addSubnet('169.254.0.0', 16);
export function localWizAddress(address: string, interfaces: readonly WizInterface[]): boolean {
  return (
    z.ipv4().safeParse(address).success &&
    PRIVATE.check(address, 'ipv4') &&
    interfaceFor(address, interfaces) !== undefined
  );
}
