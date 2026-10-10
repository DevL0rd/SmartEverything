import type { ReactNode } from 'react';
import { Badge, type BadgeTone } from './badge';
import type { IconName } from './icon';

export type Status = 'offline' | 'attention' | 'stale' | 'live' | 'blocked' | 'privacy';

const STATUS: Readonly<Record<Status, { label: string; tone: BadgeTone; icon: IconName }>> = {
  offline: { label: 'Offline', tone: 'neutral', icon: 'wifi' },
  attention: { label: 'Needs attention', tone: 'warning', icon: 'warning' },
  stale: { label: 'Not updated', tone: 'warning', icon: 'clock' },
  live: { label: 'Live', tone: 'positive', icon: 'dot' },
  blocked: { label: 'Blocked by firewall', tone: 'critical', icon: 'shield' },
  privacy: { label: 'Privacy on', tone: 'neutral', icon: 'eyeOff' },
};

export function StatusChip({
  status,
  label,
}: {
  readonly status: Status;
  readonly label?: string;
}): ReactNode {
  const look = STATUS[status];
  return <Badge label={label ?? look.label} tone={look.tone} icon={look.icon} />;
}
