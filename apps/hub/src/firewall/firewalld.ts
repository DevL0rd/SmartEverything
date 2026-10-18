import type { PortRule } from '@smarteverything/domain';
import {
  FIXABLE_UNLESS_DENIED,
  addressIn,
  portIn,
  sourceEdges,
  type OpeningState,
  type Probe,
} from './openings';
import { defaultInterface } from './lan-networks';
import { answerOf, type FirewallSystem } from './system';

const FIREWALL_CMD = 'firewall-cmd';
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

async function zoneName(system: FirewallSystem): Promise<string> {
  const device = await defaultInterface(system.read);
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

type SourceRule = Exclude<
  PortRule,
  { readonly purpose: 'webrtc' | 'plugin' | 'hub' | 'discovery' | 'announcement' }
>;

type PluginRule = Extract<
  PortRule,
  { readonly purpose: 'plugin' | 'hub' | 'discovery' | 'announcement' }
>;

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

function pluginRichRuleCovers(text: string, rule: PluginRule): boolean {
  const source = /source address="([^"]+)"/.exec(text)?.[1];
  const port = /port port="([^"]+)"/.exec(text)?.[1];
  const protocol = /protocol="([^"]+)"/.exec(text)?.[1];
  return (
    source !== undefined &&
    !text.includes('source NOT') &&
    sourceEdges(rule.source).every((edge) => addressIn(source, edge)) &&
    port !== undefined &&
    portIn(port, rule.port) &&
    protocol === rule.protocol
  );
}

function verdictState(rules: readonly string[]): OpeningState {
  const verdicts = rules.map((text) => text.split(' ').at(-1) ?? '');
  if (verdicts.some((verdict) => REFUSED.has(verdict))) {
    return 'denied';
  }
  return verdicts.some((verdict) => ACCEPTED.has(verdict)) ? 'open' : 'missing';
}

function sourceState(zone: Zone, rule: SourceRule): OpeningState {
  return verdictState(zone.richRules.filter((text) => richRuleCovers(text, rule)));
}

function pluginState(zone: Zone, rule: PluginRule): OpeningState {
  if (portOpen(zone, rule.protocol, rule.port)) {
    return 'open';
  }
  return verdictState(zone.richRules.filter((text) => pluginRichRuleCovers(text, rule)));
}

function firewalldStateOf(zone: Zone, rule: PortRule): OpeningState {
  if (zone.target === 'ACCEPT' || zone.protocols.includes(rule.protocol)) {
    return 'open';
  }
  if (rule.purpose === 'webrtc') {
    return portOpen(zone, rule.protocol, rule.port) ? 'open' : 'missing';
  }
  return 'port' in rule ? pluginState(zone, rule) : sourceState(zone, rule);
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
      unprivilegedPortStart: null,
    }),
    fixable: FIXABLE_UNLESS_DENIED,
    watch: WATCHED,
  };
}
