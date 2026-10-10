import { BlockList, isIP } from 'node:net';
import type {
  FirewallBackend,
  FirewallOpening,
  FirewallPlan,
  PortRule,
} from '@smarteverything/domain';
import type { FirewallSystem } from './system';

export type OpeningState = FirewallOpening['state'];

export interface RequiredOpening {
  readonly id: string;
  readonly deviceIds: readonly string[];
  readonly pluginIds: readonly string[];
  readonly rule: PortRule;
}

export interface DeviceAddress {
  readonly deviceId: string;
  readonly address: string;
}

export interface PluginPortNeed {
  readonly pluginId: string;
  readonly protocol: 'tcp' | 'udp';
  readonly port: number;
}

export interface OpeningNeeds {
  readonly cameras: readonly DeviceAddress[];
  readonly pushing: readonly DeviceAddress[];
  readonly plugins: readonly PluginPortNeed[];
  readonly networks: readonly string[];
  readonly webrtcPort: number;
}

type WithoutRevision<T> = T extends unknown ? Omit<T, 'revision'> : never;

export type PlanDraft = WithoutRevision<FirewallPlan>;

export interface Probe {
  readonly backend: FirewallBackend;
  readonly filtering: boolean | null;
  readonly detail: string;
  readonly stateOf: (rule: PortRule) => OpeningState;
  readonly draft: ((needed: readonly FirewallOpening[]) => PlanDraft) | null;
  readonly fixable: ReadonlySet<OpeningState>;
  readonly watch: readonly string[];
}

export type Prober = (system: FirewallSystem) => Promise<Probe>;

export const FIXABLE_UNLESS_DENIED: ReadonlySet<OpeningState> = new Set(['missing', 'unknown']);

export function cameraAddressOf(source: string): string | null {
  const host = URL.parse(source)?.hostname.replace(/^\[|\]$/g, '') ?? '';
  return isIP(host) === 0 ? null : host;
}

function sourceOpenings(
  purpose: 'camera' | 'device',
  devices: readonly DeviceAddress[],
): RequiredOpening[] {
  const byAddress = new Map<string, string[]>();
  for (const device of devices) {
    byAddress.set(device.address, [...(byAddress.get(device.address) ?? []), device.deviceId]);
  }
  return [...byAddress].map(([address, deviceIds]): RequiredOpening => ({
    id: `${purpose}:${address}`,
    deviceIds,
    pluginIds: [],
    rule: { purpose, protocol: 'udp', source: address },
  }));
}

function pluginOpenings(
  plugins: readonly PluginPortNeed[],
  networks: readonly string[],
): RequiredOpening[] {
  const byPort = new Map<string, { need: PluginPortNeed; pluginIds: string[] }>();
  for (const need of plugins) {
    const key = `${need.protocol}:${String(need.port)}`;
    const entry = byPort.get(key) ?? { need, pluginIds: [] };
    entry.pluginIds.push(need.pluginId);
    byPort.set(key, entry);
  }
  return [...byPort.values()].flatMap(({ need, pluginIds }) =>
    networks.map((source): RequiredOpening => ({
      id: `plugin:${need.protocol}:${String(need.port)}:${source}`,
      deviceIds: [],
      pluginIds: [...new Set(pluginIds)],
      rule: { purpose: 'plugin', protocol: need.protocol, port: need.port, source },
    })),
  );
}

export function requiredOpenings({
  cameras,
  pushing,
  plugins,
  networks,
  webrtcPort,
}: OpeningNeeds): readonly RequiredOpening[] {
  const webrtc = (['tcp', 'udp'] as const).map((protocol): RequiredOpening => ({
    id: `webrtc:${protocol}:${String(webrtcPort)}`,
    deviceIds: [],
    pluginIds: [],
    rule: { purpose: 'webrtc', protocol, port: webrtcPort },
  }));
  return [
    ...sourceOpenings('camera', cameras),
    ...sourceOpenings('device', pushing),
    ...pluginOpenings(plugins, networks),
    ...webrtc,
  ];
}

function familyOf(address: string): 'ipv4' | 'ipv6' | null {
  const version = isIP(address);
  if (version === 0) {
    return null;
  }
  return version === 6 ? 'ipv6' : 'ipv4';
}

export function addressIn(range: string, address: string): boolean {
  const family = familyOf(address);
  const [network = '', prefix] = range.split('/');
  if (family === null || familyOf(network) !== family) {
    return false;
  }
  const list = new BlockList();
  if (prefix === undefined) {
    list.addAddress(network, family);
  } else {
    list.addSubnet(network, Number(prefix), family);
  }
  return list.check(address, family);
}

export function sourceEdges(source: string): readonly string[] {
  const [network = '', prefix] = source.split('/');
  if (prefix === undefined || isIP(network) !== 4) {
    return [network];
  }
  const bits = Number(prefix);
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  const base = network.split('.').reduce((total, part) => total * 256 + Number(part), 0);
  const first = (base & mask) >>> 0;
  const last = (first | (~mask >>> 0)) >>> 0;
  const text = (value: number): string =>
    [24, 16, 8, 0].map((shift) => String((value >>> shift) & 255)).join('.');
  return [text(first), text(last)];
}

export function portIn(list: string, port: number): boolean {
  return list.split(',').some((entry) => {
    const [low = '', high = low] = entry.split(/[:-]/);
    return Number(low) <= port && port <= Number(high);
  });
}

export function always(state: OpeningState): (rule: PortRule) => OpeningState {
  return () => state;
}
