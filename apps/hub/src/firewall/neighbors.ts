import { MAC_ADDRESS } from '@smarteverything/domain';
import type { FirewallSystem } from './system';

const ARP_TABLE = '/proc/net/arp';
const INCOMPLETE_FLAG = '0x0';
const PRINTED_ENTRY =
  /(\d{1,3}(?:\.\d{1,3}){3})\)?\s+(?:at\s+)?((?:[0-9a-f]{1,2}[:-]){5}[0-9a-f]{1,2})/giu;

type Neighbors = ReadonlyMap<string, string>;

function macOf(text: string): string | null {
  const padded = text
    .split(/[:-]/u)
    .map((octet) => octet.padStart(2, '0'))
    .join(':');
  const parsed = MAC_ADDRESS.safeParse(padded);
  return parsed.success ? parsed.data : null;
}

function withEntry(table: Map<string, string>, address: string | undefined, text: string): void {
  const mac = macOf(text);
  if (address !== undefined && mac !== null) {
    table.set(address, mac);
  }
}

function procTable(text: string): Neighbors {
  const table = new Map<string, string>();
  for (const line of text.split('\n').slice(1)) {
    const [address, , flags, mac] = line.trim().split(/\s+/u);
    if (flags !== INCOMPLETE_FLAG) {
      withEntry(table, address, mac ?? '');
    }
  }
  return table;
}

function printedTable(text: string): Neighbors {
  const table = new Map<string, string>();
  for (const [, address, mac] of text.matchAll(PRINTED_ENTRY)) {
    withEntry(table, address, mac ?? '');
  }
  return table;
}

export async function neighborMacs(system: FirewallSystem): Promise<Neighbors> {
  if (system.platform === 'linux') {
    return procTable((await system.read(ARP_TABLE)) ?? '');
  }
  const args = system.platform === 'darwin' ? ['-an'] : ['-a'];
  return printedTable((await system.run('arp', args))?.stdout ?? '');
}
