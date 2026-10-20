import { createSocket } from 'node:dgram';
import { BlockList, isIPv4 } from 'node:net';
import { networkInterfaces, type NetworkInterfaceInfo } from 'node:os';

export type InterfaceSnapshot = Readonly<
  Record<string, readonly NetworkInterfaceInfo[] | undefined>
>;

export interface LanInterface {
  readonly name: string;
  readonly address: string;
  readonly cidr: string;
  readonly prefix: number;
}

const PROBE_ADDRESS = '1.1.1.1';
const PROBE_PORT = 53;

const VIRTUAL_NAME =
  /vethernet|virtual|vmware|virtualbox|docker|wsl|hyper-v|virbr|br-|tailscale|zt/i;
const WIFI_NAME = /wi-?fi|wlan|wlp/i;
const WIRED_NAME = /ethernet|eth|enp|eno/i;

const WIFI_SCORE = 30;
const WIRED_SCORE = 20;
const HOME_SCORE = 10;
const OFFICE_SCORE = 8;
const CAMPUS_SCORE = 6;
const VIRTUAL_PENALTY = 50;

const PRIVATE_IPV4 = new BlockList();
PRIVATE_IPV4.addSubnet('10.0.0.0', 8, 'ipv4');
PRIVATE_IPV4.addSubnet('172.16.0.0', 12, 'ipv4');
PRIVATE_IPV4.addSubnet('192.168.0.0', 16, 'ipv4');

export function interfaceEntries(
  snapshot: InterfaceSnapshot = networkInterfaces(),
): readonly NetworkInterfaceInfo[] {
  return Object.values(snapshot).flatMap((entries) => entries ?? []);
}

export function addressesOf(snapshot: InterfaceSnapshot, name: string): string[] {
  return (snapshot[name] ?? []).map((entry) => entry.address);
}

export function isVirtualInterface(name: string): boolean {
  return VIRTUAL_NAME.test(name);
}

export function isPrivateIPv4(address: string): boolean {
  return PRIVATE_IPV4.check(address, 'ipv4');
}

function usableIPv4(address: string): boolean {
  return isIPv4(address) && !address.startsWith('127.') && !address.startsWith('169.254.');
}

export function lanInterfaces(snapshot: InterfaceSnapshot = networkInterfaces()): LanInterface[] {
  return Object.entries(snapshot).flatMap(([name, entries]) =>
    (entries ?? []).flatMap((entry) => {
      const prefix = Number(entry.cidr?.split('/')[1]);
      if (entry.internal || entry.family !== 'IPv4' || !usableIPv4(entry.address)) return [];
      if (entry.cidr === null || Number.isNaN(prefix)) return [];
      return [{ name, address: entry.address, cidr: entry.cidr, prefix }];
    }),
  );
}

function outbound(): Promise<string> {
  return new Promise((resolve) => {
    const socket = createSocket('udp4');
    let finished = false;
    const done = (address: string): void => {
      if (finished) return;
      finished = true;
      resolve(address);
      socket.close();
    };
    socket.once('error', () => {
      done('');
    });
    socket.connect(PROBE_PORT, PROBE_ADDRESS, () => {
      const { address } = socket.address();
      done(usableIPv4(address) ? address : '');
    });
  });
}

function score({ name, address }: LanInterface): number {
  let value = 0;
  value += WIFI_NAME.test(name) ? WIFI_SCORE : 0;
  value += WIRED_NAME.test(name) ? WIRED_SCORE : 0;
  value += address.startsWith('192.168.') ? HOME_SCORE : 0;
  value += address.startsWith('10.') ? OFFICE_SCORE : 0;
  value += /^172\.(1[6-9]|2\d|3[01])\./.test(address) ? CAMPUS_SCORE : 0;
  value -= VIRTUAL_NAME.test(name) ? VIRTUAL_PENALTY : 0;
  return value;
}

export async function homeLanAddress(
  snapshot: InterfaceSnapshot = networkInterfaces(),
): Promise<string> {
  const found = await outbound();
  if (found !== '') return found;
  const best = [...lanInterfaces(snapshot)].sort((a, b) => score(b) - score(a))[0];
  return best?.address ?? '';
}
