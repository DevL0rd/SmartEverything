import { Socket } from 'node:net';
import { REST_PORT } from '@smarteverything/smartthings';
import {
  isPrivateIPv4,
  isVirtualInterface,
  lanInterfaces,
  type LanInterface,
} from '../../network/lan';

export const CONNECT_TIMEOUT_MS = 800;

const WIDEST_PREFIX = 22;

const NARROWEST_PREFIX = 30;

const IPV4_BITS = 32;

const OCTET_BITS = 8;

const OCTET_SIZE = 256;

export type PortProbe = (host: string, port: number, timeoutMs: number) => Promise<boolean>;

export type HostSearch = () => Promise<readonly string[]>;

function numberOf(address: string): number {
  return address.split('.').reduce((total, octet) => total * OCTET_SIZE + Number(octet), 0);
}

function addressOf(value: number): string {
  return [3, 2, 1, 0]
    .map((shift) => String(Math.floor(value / 2 ** (shift * OCTET_BITS)) % OCTET_SIZE))
    .join('.');
}

function worthSweeping({ name, address, prefix }: LanInterface): boolean {
  return (
    !isVirtualInterface(name) &&
    isPrivateIPv4(address) &&
    prefix >= WIDEST_PREFIX &&
    prefix <= NARROWEST_PREFIX
  );
}

export function sweepHosts(interfaces: readonly LanInterface[]): readonly string[] {
  const hosts = new Set<string>();
  const own = new Set(interfaces.map((entry) => entry.address));
  for (const entry of interfaces.filter(worthSweeping)) {
    const size = 2 ** (IPV4_BITS - entry.prefix);
    const network = Math.floor(numberOf(entry.address) / size) * size;
    for (let offset = 1; offset < size - 1; offset += 1) {
      const host = addressOf(network + offset);
      if (!own.has(host)) {
        hosts.add(host);
      }
    }
  }
  return [...hosts];
}

export const tcpProbe: PortProbe = (host, port, timeoutMs) =>
  new Promise((resolve) => {
    const socket = new Socket();
    const done = (open: boolean): void => {
      socket.destroy();
      resolve(open);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => {
      done(true);
    });
    socket.once('timeout', () => {
      done(false);
    });
    socket.once('error', () => {
      done(false);
    });
    socket.connect(port, host);
  });

export function lanSweep(
  probe: PortProbe = tcpProbe,
  interfaces: () => readonly LanInterface[] = lanInterfaces,
): HostSearch {
  return async () => {
    const hosts = sweepHosts(interfaces());
    const open = await Promise.all(
      hosts.map(async (host) => ((await probe(host, REST_PORT, CONNECT_TIMEOUT_MS)) ? host : null)),
    );
    return open.filter((host): host is string => host !== null);
  };
}
