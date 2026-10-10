import type { PortRule } from '@smarteverything/domain';
import {
  FIXABLE_UNLESS_DENIED,
  addressIn,
  portIn,
  type OpeningState,
  type Probe,
} from './openings';
import { answerOf, type FirewallSystem } from './system';

const FIREWALL_CMD = 'firewall-cmd';
const ROUTE_TABLE = '/proc/net/route';
const WATCHED = ['/etc/firewalld', '/etc/firewalld/zones'];
const ACCEPTED = new Set(['accept']);
const REFUSED = new Set(['reject', 'drop']);

interface Zone {
  readonly name: string;
  readonly target: string;
  readonly ports: readonly string[];
  readonly protocols: readonly string[];
  readonly richRules: readonly string[];
}

async function ask(system: FirewallSystem, args: readonly string[]): Promise<string> {
  return (await answerOf(system, FIREWALL_CMD, args)).trim();
}

export async function firewalldRunning(system: FirewallSystem): Promise<boolean> {
  const result = await system.run(FIREWALL_CMD, ['--state']);
  return result?.code === 0 && result.stdout.trim() === 'running';
}

async function defaultInterface(system: FirewallSystem): Promise<string | null> {
  const table = (await system.read(ROUTE_TABLE)) ?? '';
  const route = table
    .split('\n')
    .slice(1)
    .map((line) => line.trim().split(/\s+/))
    .find((fields) => fields[1] === '00000000');
  return route?.[0] ?? null;
}

async function zoneName(system: FirewallSystem): Promise<string> {
  const device = await defaultInterface(system);
  if (device !== null) {
    const bound = await system.run(FIREWALL_CMD, [`--get-zone-of-interface=${device}`]);
    if (bound?.code === 0) {
      return bound.stdout.trim();
    }
  }
  return ask(system, ['--get-default-zone']);
}

function fieldOf(lines: readonly string[], key: string): readonly string[] {
  const line = lines.find((entry) => entry.trim().startsWith(`${key}:`));
  const value =
    line === undefined
      ? ''
      : line
          .trim()
          .slice(key.length + 1)
          .trim();
  return value === '' ? [] : value.split(/\s+/);
}

function zoneOf(name: string, listing: string): Zone {
  const lines = listing.split('\n');
  const richStart = lines.findIndex((line) => line.trim().startsWith('rich rules:'));
  return {
    name,
    target: fieldOf(lines, 'target').join(' '),
    ports: fieldOf(lines, 'ports'),
    protocols: fieldOf(lines, 'protocols'),
    richRules:
      richStart === -1
        ? []
        : lines
            .slice(richStart + 1)
            .map((line) => line.trim())
            .filter((line) => line.startsWith('rule ')),
  };
}

function portOpen(zone: Zone, protocol: string, port: number): boolean {
  return zone.ports.some((entry) => {
    const [range = '', entryProtocol] = entry.split('/');
    return entryProtocol === protocol && portIn(range, port);
  });
}

type SourceRule = Exclude<PortRule, { readonly purpose: 'webrtc' }>;

function richRuleCovers(text: string, rule: SourceRule): boolean {
  const source = /source address="([^"]+)"/.exec(text)?.[1];
  const protocol = /protocol value="([^"]+)"/.exec(text)?.[1];
  const portBound = text.includes(' port port=');
  return (
    source !== undefined &&
    !text.includes('source NOT') &&
    addressIn(source, rule.source) &&
    !portBound &&
    (protocol === undefined || protocol === rule.protocol)
  );
}

function sourceState(zone: Zone, rule: SourceRule): OpeningState {
  const matching = zone.richRules.filter((text) => richRuleCovers(text, rule));
  const verdicts = matching.map((text) => text.split(' ').at(-1) ?? '');
  if (verdicts.some((verdict) => REFUSED.has(verdict))) {
    return 'denied';
  }
  return verdicts.some((verdict) => ACCEPTED.has(verdict)) ? 'open' : 'missing';
}

function firewalldStateOf(zone: Zone, rule: PortRule): OpeningState {
  if (zone.target === 'ACCEPT' || zone.protocols.includes(rule.protocol)) {
    return 'open';
  }
  if (rule.purpose === 'webrtc') {
    return portOpen(zone, rule.protocol, rule.port) ? 'open' : 'missing';
  }
  return sourceState(zone, rule);
}

export async function probeFirewalld(system: FirewallSystem): Promise<Probe> {
  const name = await zoneName(system);
  const zone = zoneOf(name, await ask(system, [`--zone=${name}`, '--list-all']));
  const filtering = zone.target !== 'ACCEPT';
  return {
    backend: 'firewalld',
    filtering,
    detail: filtering
      ? `firewalld is running and the ${name} zone only lets in what it allows.`
      : `firewalld is running and the ${name} zone accepts everything.`,
    stateOf: (rule) => firewalldStateOf(zone, rule),
    draft: (needed) => ({
      backend: 'firewalld',
      zone: name,
      rules: needed.map((opening) => opening.rule),
    }),
    fixable: FIXABLE_UNLESS_DENIED,
    watch: WATCHED,
  };
}
