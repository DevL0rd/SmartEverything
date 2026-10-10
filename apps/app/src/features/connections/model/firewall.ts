import type {
  CameraReach,
  FirewallBackend,
  FirewallOpening,
  FirewallStatus,
  PortRule,
} from '@smarteverything/domain';
import type { BadgeTone } from '../../../components/badge';
import { plural } from '../../../format/text';

export const BACKEND_LABELS: Readonly<Record<FirewallBackend, string>> = {
  ufw: 'ufw',
  firewalld: 'firewalld',
  nftables: 'nftables',
  iptables: 'iptables',
  windows: 'Windows Defender Firewall',
  macos: 'macOS firewall',
  none: 'No firewall',
  unknown: 'Unknown firewall',
};

export interface StateLook {
  readonly label: string;
  readonly tone: BadgeTone;
}

export const OPENING_LOOK: Readonly<Record<FirewallOpening['state'], StateLook>> = {
  open: { label: 'Open', tone: 'positive' },
  missing: { label: 'Missing', tone: 'warning' },
  denied: { label: 'Blocked', tone: 'critical' },
  unknown: { label: 'Unknown', tone: 'neutral' },
};

export const REACH_LOOK: Readonly<Record<CameraReach['state'], StateLook>> = {
  open: { label: 'Reachable', tone: 'positive' },
  needs_rule: { label: 'Needs a rule', tone: 'warning' },
  blocked: { label: 'Blocked by firewall', tone: 'critical' },
  unreachable: { label: 'Not on your network', tone: 'neutral' },
  unknown: { label: 'Not checked yet', tone: 'neutral' },
};

export function ruleText(rule: PortRule): string {
  const protocol = rule.protocol.toUpperCase();
  return rule.purpose === 'webrtc'
    ? `${protocol} port ${String(rule.port)}`
    : `${protocol} from ${rule.source}`;
}

export function openingTitle(opening: FirewallOpening, names: readonly string[]): string {
  const who = names.length === 0 ? null : names.join(', ');
  switch (opening.rule.purpose) {
    case 'webrtc':
      return 'Live video';
    case 'camera':
      return who ?? 'Camera';
    case 'device':
      return who === null ? 'Device updates' : `${who} updates`;
  }
}

export function needsFix(firewall: FirewallStatus): readonly FirewallOpening[] {
  return firewall.openings.filter(
    (opening) => opening.state === 'missing' || opening.state === 'denied',
  );
}

export interface FirewallSummary {
  readonly text: string;
  readonly critical: boolean;
}

export function firewallSummary(firewall: FirewallStatus | null): FirewallSummary {
  if (firewall === null) {
    return { text: 'Not checked', critical: false };
  }
  const missing = needsFix(firewall).length;
  if (missing > 0) {
    return { text: `${plural(missing, 'opening')} missing`, critical: true };
  }
  return { text: firewall.backend === 'none' ? 'No firewall' : 'All open', critical: false };
}
