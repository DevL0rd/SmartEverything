import { BlockList } from 'node:net';
import { networkInterfaces } from 'node:os';
import { sourceEdges } from './openings';

const ROUTE_TABLE = '/proc/net/route';

const PRIVATE_IPV4 = new BlockList();
PRIVATE_IPV4.addSubnet('10.0.0.0', 8, 'ipv4');
PRIVATE_IPV4.addSubnet('172.16.0.0', 12, 'ipv4');
PRIVATE_IPV4.addSubnet('192.168.0.0', 16, 'ipv4');

export async function defaultInterface(
  read: (path: string) => Promise<string | null>,
): Promise<string | null> {
  const table = (await read(ROUTE_TABLE)) ?? '';
  const route = table
    .split('\n')
    .slice(1)
    .map((line) => line.trim().split(/\s+/))
    .find((fields) => fields[1] === '00000000');
  return route?.[0] ?? null;
}

export async function lanNetworks(
  read: (path: string) => Promise<string | null>,
): Promise<readonly string[]> {
  const only = await defaultInterface(read);
  const networks = Object.entries(networkInterfaces())
    .filter(([name]) => only === null || name === only)
    .flatMap(([, addresses]) => addresses ?? [])
    .flatMap((entry) => {
      const lan =
        entry.family === 'IPv4' && !entry.internal && PRIVATE_IPV4.check(entry.address, 'ipv4');
      const prefix = entry.cidr?.split('/')[1];
      const [base] = sourceEdges(entry.cidr ?? '');
      return lan && prefix !== undefined && base !== undefined ? [`${base}/${prefix}`] : [];
    });
  return [...new Set(networks)];
}
