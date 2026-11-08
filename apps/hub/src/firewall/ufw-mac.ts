import {
  UFW_MAC_BEGIN,
  UFW_MAC_END,
  isDeviceRule,
  rulePort,
  type DeviceRule,
  type FirewallOpening,
  type UfwMacEntry,
  type UfwMacOpenings,
  type UfwStaleRule,
} from '@smarteverything/domain';
import type { DeviceAddress } from './openings';

const MAC_IN_LINE =
  /-p (tcp|udp)(?: --dport (\d+))? -m mac --mac-source ([0-9a-f]{2}(?::[0-9a-f]{2}){5}) -j ACCEPT$/;

export interface MacFiles {
  readonly ipv4: string;
  readonly ipv6: string;
}

export function entryOf(rule: DeviceRule): UfwMacEntry {
  return { mac: rule.mac, protocol: rule.protocol, port: rulePort(rule) };
}

export function entryKey(entry: UfwMacEntry): string {
  return `${entry.protocol}:${entry.port === null ? 'any' : String(entry.port)}:${entry.mac}`;
}

export function managedEntries(text: string): ReadonlySet<string> {
  const lines = text.split('\n').map((line) => line.trim());
  const start = lines.indexOf(UFW_MAC_BEGIN);
  const end = lines.indexOf(UFW_MAC_END);
  if (start === -1 || end < start) {
    return new Set();
  }
  return new Set(
    lines.slice(start + 1, end).flatMap((line) => {
      const [, protocol, port, mac] = MAC_IN_LINE.exec(line) ?? [];
      return protocol === undefined || mac === undefined
        ? []
        : [`${protocol}:${port ?? 'any'}:${mac}`];
    }),
  );
}

function sameSet(left: ReadonlySet<string>, right: readonly string[]): boolean {
  return left.size === right.length && right.every((key) => left.has(key));
}

function uniqueEntries(openings: readonly FirewallOpening[]): UfwMacEntry[] {
  const byKey = new Map<string, UfwMacEntry>();
  for (const { rule } of openings) {
    if (isDeviceRule(rule)) {
      byKey.set(entryKey(entryOf(rule)), entryOf(rule));
    }
  }
  return [...byKey].sort(([left], [right]) => left.localeCompare(right)).map(([, entry]) => entry);
}

export function macOpenings(
  openings: readonly FirewallOpening[],
  unlearned: readonly DeviceAddress[],
  files: MacFiles,
  legacy: { readonly addresses: readonly string[]; readonly rules: readonly UfwStaleRule[] },
): UfwMacOpenings | null {
  const entries = uniqueEntries(openings);
  const waiting = new Set(unlearned.map((device) => device.address));
  const staleAddresses = [
    ...new Set(legacy.addresses.filter((address) => !waiting.has(address))),
  ].sort();
  const staleRules = [...legacy.rules];
  const keys = entries.map(entryKey);
  const current = [managedEntries(files.ipv4), managedEntries(files.ipv6)];
  return staleAddresses.length === 0 &&
    staleRules.length === 0 &&
    current.every((set) => sameSet(set, keys))
    ? null
    : { entries, staleAddresses, staleRules };
}
