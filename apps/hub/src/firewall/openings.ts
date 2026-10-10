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
  readonly rule: PortRule;
}

export interface DeviceAddress {
  readonly deviceId: string;
  readonly address: string;
}

export interface OpeningNeeds {
  readonly cameras: readonly DeviceAddress[];
  readonly pushing: readonly DeviceAddress[];
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
    rule: { purpose, protocol: 'udp', source: address },
  }));
}

export function requiredOpenings({
  cameras,
  pushing,
  webrtcPort,
}: OpeningNeeds): readonly RequiredOpening[] {
  const webrtc = (['tcp', 'udp'] as const).map((protocol): RequiredOpening => ({
    id: `webrtc:${protocol}:${String(webrtcPort)}`,
    deviceIds: [],
    rule: { purpose: 'webrtc', protocol, port: webrtcPort },
  }));
  return [...sourceOpenings('camera', cameras), ...sourceOpenings('device', pushing), ...webrtc];
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

export function portIn(list: string, port: number): boolean {
  return list.split(',').some((entry) => {
    const [low = '', high = low] = entry.split(/[:-]/);
    return Number(low) <= port && port <= Number(high);
  });
}

export function always(state: OpeningState): (rule: PortRule) => OpeningState {
  return () => state;
}
