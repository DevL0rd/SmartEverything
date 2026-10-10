import {
  inTier,
  isCamera,
  presentDevice,
  type PresentationTier,
  type PresentedCapability,
} from '@smarteverything/domain';
import { cameraSections } from '../features/cameras/settings/camera-groups';
import { controlGroupsOf, extrasOf, settingsOf } from '../features/devices/model/control-groups';
import type { Device } from '../store/state';

export type DevicePage = 'overview' | 'controls' | 'settings' | 'camera' | 'diagnostics';

export const DEVICE_PAGE_TITLES: Readonly<Record<DevicePage, string>> = {
  overview: 'Overview',
  controls: 'All controls',
  settings: 'Device settings',
  camera: 'Camera options',
  diagnostics: 'Diagnostics',
};

export interface DevicePlace {
  readonly page: DevicePage;
  readonly title: string;
  readonly capabilities: readonly PresentedCapability[];
}

function tierPlace(
  capabilities: readonly PresentedCapability[],
  tier: PresentationTier,
  place: Omit<DevicePlace, 'capabilities'>,
): DevicePlace {
  return { ...place, capabilities: capabilities.filter((presented) => presented.tier === tier) };
}

function pagePlaces(device: Device): readonly DevicePlace[] {
  const presentation = presentDevice(device);
  const all = presentation.capabilities;
  const camera = isCamera(device)
    ? cameraSections(device).map((section) => ({ page: 'camera' as const, ...section }))
    : [];
  return [
    {
      page: 'overview',
      title: '',
      capabilities: all.filter((presented) => presented.role === 'power'),
    },
    ...camera,
    ...controlGroupsOf(presentation).map((group) => ({
      page: 'controls' as const,
      title: group.label,
      capabilities: group.controls,
    })),
    { page: 'controls', title: 'More', capabilities: extrasOf(presentation) },
    { page: 'settings', title: 'Device options', capabilities: settingsOf(presentation) },
    tierPlace(all, 'maintenance', { page: 'settings', title: 'Maintenance' }),
    { page: 'overview', title: 'Readings', capabilities: inTier(presentation, 'reading') },
    tierPlace(all, 'diagnostic', { page: 'diagnostics', title: 'Details' }),
  ];
}

function unplaced(device: Device, placed: ReadonlySet<string>): DevicePlace {
  return {
    page: 'overview',
    title: 'Other',
    capabilities: presentDevice(device).capabilities.filter(
      (presented) => presented.tier !== 'hidden' && !placed.has(presented.key),
    ),
  };
}

export function devicePlaces(device: Device): readonly DevicePlace[] {
  const placed = new Set<string>();
  const places: DevicePlace[] = [];
  for (const place of pagePlaces(device)) {
    const fresh = place.capabilities.filter(
      (presented) => presented.tier !== 'hidden' && !placed.has(presented.key),
    );
    for (const presented of fresh) {
      placed.add(presented.key);
    }
    places.push({ ...place, capabilities: fresh });
  }
  places.push(unplaced(device, placed));
  return places.filter((place) => place.capabilities.length > 0);
}
