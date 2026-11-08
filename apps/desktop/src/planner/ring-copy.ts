import type { DesktopRing } from './ring-types.js';

const KIND_NAMES = { alarm: 'Alarm', timer: 'Timer', reminder: 'Reminder' } as const;

export function ringTime(ring: DesktopRing): string {
  return new Date(ring.dueAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function ringTitle(ring: DesktopRing): string {
  return ring.label ?? KIND_NAMES[ring.kind];
}

export function ringingNotice(ring: DesktopRing): {
  readonly title: string;
  readonly body: string;
} {
  return { title: ringTitle(ring), body: ringTime(ring) };
}

export function missedNotice(ring: DesktopRing): { readonly title: string; readonly body: string } {
  const label = ring.label === null ? '' : ` ${ring.label}`;
  return {
    title: `Missed ${KIND_NAMES[ring.kind].toLowerCase()} ${ringTime(ring)}${label}`,
    body: 'This computer was asleep.',
  };
}
