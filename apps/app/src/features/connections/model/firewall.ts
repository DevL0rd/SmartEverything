import type {
  CameraReach,
  FirewallApplyOutcome,
  FirewallBackend,
  FirewallOpening,
  FirewallStatus,
  FirewallStepResult,
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

export const STEP_LOOK: Readonly<Record<FirewallStepResult['outcome'], StateLook>> = {
  applied: { label: 'Added', tone: 'positive' },
  already_present: { label: 'Already there', tone: 'neutral' },
  failed: { label: 'Failed', tone: 'critical' },
};

export const APPLY_NOTICE: Readonly<
  Record<
    FirewallApplyOutcome,
    { readonly tone: 'warning' | 'critical' | 'info' | 'positive'; readonly title: string }
  >
> = {
  applied: { tone: 'positive', title: 'Firewall fixed' },
  partial: { tone: 'warning', title: 'Some rules weren’t added' },
  failed: { tone: 'critical', title: 'The rules weren’t added' },
  declined: { tone: 'warning', title: 'You cancelled the system prompt' },
  stale: { tone: 'info', title: 'The rules changed. Review them again.' },
  unavailable: { tone: 'warning', title: 'The server can’t change its firewall by itself' },
};

export function openingTitle(opening: FirewallOpening, names: readonly string[]): string {
  switch (opening.rule.purpose) {
    case 'webrtc':
      return 'Live video';
    case 'hub':
      return 'Local server connection';
    case 'discovery':
      return 'Server discovery';
    case 'announcement':
      return 'Device announcements';
    case 'camera':
    case 'device':
    case 'plugin':
      return namedOpeningTitle(opening.rule, names);
  }
}

function namedOpeningTitle(
  rule: Extract<PortRule, { readonly purpose: 'camera' | 'device' | 'plugin' }>,
  names: readonly string[],
): string {
  const who = names.length === 0 ? null : names.join(', ');
  switch (rule.purpose) {
    case 'camera':
      return who ?? 'Camera';
    case 'device':
      return who === null ? 'Device updates' : `${who} updates`;
    case 'plugin':
      return who ?? 'Plugin';
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
  const missing = needsFix(firewall).length + (firewall.lowPorts?.state === 'missing' ? 1 : 0);
  if (missing > 0) {
    return { text: `${plural(missing, 'opening')} missing`, critical: true };
  }
  return { text: firewall.backend === 'none' ? 'No firewall' : 'All open', critical: false };
}
