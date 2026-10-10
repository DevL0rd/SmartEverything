import type {
  DevicePresentation,
  PresentationTier,
  PresentedCapability,
} from '@smarteverything/domain';

export interface ControlGroup {
  readonly label: string;
  readonly controls: readonly PresentedCapability[];
}

const CONTROL_TIERS: ReadonlySet<PresentationTier> = new Set(['primary', 'control']);

function grouped(capabilities: readonly PresentedCapability[]): readonly ControlGroup[] {
  const groups = new Map<string, PresentedCapability[]>();
  for (const presented of capabilities) {
    const group = groups.get(presented.groupLabel) ?? [];
    group.push(presented);
    groups.set(presented.groupLabel, group);
  }
  return [...groups].map(([label, controls]) => ({ label, controls }));
}

export function controlGroupsOf(presentation: DevicePresentation): readonly ControlGroup[] {
  return grouped(
    presentation.capabilities.filter(
      (presented) =>
        CONTROL_TIERS.has(presented.tier) && presented.writable && presented.role !== 'power',
    ),
  );
}

export function settingsOf(presentation: DevicePresentation): readonly PresentedCapability[] {
  return presentation.capabilities.filter(
    (presented) => presented.tier === 'setting' && presented.writable,
  );
}

export function extrasOf(presentation: DevicePresentation): readonly PresentedCapability[] {
  return presentation.capabilities.filter((presented) => presented.tier === 'extra');
}

export function controlCount(presentation: DevicePresentation): number {
  return controlGroupsOf(presentation).reduce((sum, group) => sum + group.controls.length, 0);
}
