import type { ConnectKind, ConnectLink, NodeHello } from '@smarteverything/domain';
import { readFileSync } from 'node:fs';
import { userInfo } from 'node:os';

const LISTEN = '0A';

const SERVICES: readonly (readonly [ConnectKind, number])[] = [
  ['ssh', 22],
  ['rdp', 3389],
  ['vnc', 5900],
  ['moonlight', 47_989],
];

const LOOPBACK = new Set(['0100007F', '00000000000000000000000001000000']);

const PRIVATE_V4 = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/;

export function listeningPorts(table: string): Set<number> {
  const ports = new Set<number>();
  for (const line of table.split('\n').slice(1)) {
    const [, local = '', , state = ''] = line.trim().split(/\s+/);
    const [address = '', port = ''] = local.split(':');
    if (state === LISTEN && !LOOPBACK.has(address) && port !== '') {
      ports.add(Number.parseInt(port, 16));
    }
  }
  return ports;
}

function hostOf(hello: NodeHello): string | null {
  const addresses = hello.interfaces.flatMap((item) => item.addresses);
  return addresses.find((address) => PRIVATE_V4.test(address)) ?? null;
}

function urlOf(kind: ConnectKind, host: string, port: number, user: string): string | null {
  if (kind === 'ssh') {
    return port === 22 ? `ssh://${user}@${host}` : `ssh://${user}@${host}:${String(port)}`;
  }
  if (kind === 'rdp') {
    return `rdp://full%20address=s:${host}:${String(port)}`;
  }
  return kind === 'vnc' ? `vnc://${host}:${String(port)}` : null;
}

export function linuxLinks(hello: NodeHello): ConnectLink[] {
  const host = hostOf(hello);
  if (host === null) {
    return [];
  }
  const ports = new Set([
    ...listeningPorts(readFileSync('/proc/net/tcp', 'utf8')),
    ...listeningPorts(readFileSync('/proc/net/tcp6', 'utf8')),
  ]);
  const user = userInfo().username;
  return SERVICES.filter(([, port]) => ports.has(port)).map(([kind, port]) => ({
    kind,
    host,
    port,
    user: kind === 'ssh' ? user : null,
    url: urlOf(kind, host, port, user),
  }));
}
