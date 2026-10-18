import { isPrivateIPv4, lanInterfaces } from '../network/lan';
import { sourceEdges } from './openings';

const ROUTE_TABLE = '/proc/net/route';

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
  const networks = lanInterfaces().flatMap((entry) => {
    const [base] = sourceEdges(entry.cidr);
    const wanted = (only === null || entry.name === only) && isPrivateIPv4(entry.address);
    return wanted && base !== undefined ? [`${base}/${String(entry.prefix)}`] : [];
  });
  return [...new Set(networks)];
}
