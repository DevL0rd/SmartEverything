import { appendTo, presentDevice, type PresentedCapability } from '@smarteverything/domain';
import type { Device } from '../../../store/state';

export interface CapabilitySection {
  readonly title: string;
  readonly capabilities: readonly PresentedCapability[];
}

const HANDLED: ReadonlySet<string> = new Set([
  'power',
  'privacy_mode',
  'ptz',
  'ptz_preset',
  'zoom',
]);

function shownIn(presented: PresentedCapability): string | null {
  if (HANDLED.has(presented.key) || presented.role === 'zoom') {
    return null;
  }
  if (presented.tier === 'maintenance') {
    return 'Memory card and upkeep';
  }
  if (presented.tier === 'control') {
    return presented.group === 'media' ? 'Speaker' : null;
  }
  if (presented.tier !== 'setting' || !presented.writable) {
    return null;
  }
  return presented.group === 'security' ? 'Detection and alerts' : 'Picture';
}

const ORDER = ['Picture', 'Detection and alerts', 'Speaker', 'Memory card and upkeep'];

export function cameraSections(device: Device): readonly CapabilitySection[] {
  const sections = new Map<string, PresentedCapability[]>();
  for (const presented of presentDevice(device).capabilities) {
    const title = shownIn(presented);
    if (title !== null) {
      appendTo(sections, title, presented);
    }
  }
  return ORDER.flatMap((title) => {
    const capabilities = sections.get(title);
    return capabilities === undefined ? [] : [{ title, capabilities }];
  });
}
