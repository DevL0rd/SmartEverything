import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { Href } from 'expo-router';
import { href } from '../../../app-shell/hrefs';
import type { IconName } from '../../../components/icon';
import type { Device } from '../../../store/state';
import { controlCount, extrasOf } from '../model/control-groups';
import type { DeviceModel } from '../model/device-model';
import { historyMetrics } from '../model/history-model';
import { RemoteSection, hasRemote } from '../remote/remote-section';
import { ActivitySection } from './activity-section';
import { ControlsSection } from './controls-section';
import { HistorySection } from './history-section';
import { MaintenanceCard } from './maintenance-card';
import { ReadingGrid, useReadings } from './reading-grid';
import { useDeviceModel } from '../model/device-model';
import { maintenanceOf } from '../model/maintenance';
import { useDeviceValues } from '../../../store/selectors';
import { ScaleDetails } from './scale-details';
import { WatchStatus, isLocalWatch } from '../../watches';
import { pluginSectionsOf } from './plugin-sections';

export type DeviceSectionKey = 'overview' | 'controls' | 'history' | 'activity' | 'remote';

export type SubSectionKey = Exclude<DeviceSectionKey, 'overview'>;

export interface DeviceSection {
  readonly key: string;
  readonly title: string;
  readonly icon: IconName;
  readonly render: (device: Device, beside: boolean) => ReactNode;
}

interface BuiltinSection extends DeviceSection {
  readonly key: DeviceSectionKey;
}

const SUB_SECTION_KEYS: readonly SubSectionKey[] = ['controls', 'history', 'activity', 'remote'];

function isSubSectionKey(key: string): key is SubSectionKey {
  return SUB_SECTION_KEYS.some((known) => known === key);
}

export function sectionHref(deviceId: string, key: string): Href {
  return isSubSectionKey(key)
    ? href.deviceSection(deviceId, key)
    : href.pluginDeviceSection(deviceId, key);
}

export function useHasOverviewDetails(device: Device): boolean {
  const model = useDeviceModel(device);
  const values = useDeviceValues(device.id);
  const readings = useReadings(device);
  return (
    model.family === 'scale' ||
    isLocalWatch(device) ||
    readings.length > 0 ||
    maintenanceOf(model, values).length > 0
  );
}

export function OverviewDetails({ device }: { readonly device: Device }): ReactNode {
  const model = useDeviceModel(device);
  return (
    <View className="gap-section-gap">
      <ReadingGrid device={device} />
      <MaintenanceCard device={device} />
      {model.family === 'scale' ? <ScaleDetails scale={device} /> : null}
      {isLocalWatch(device) ? <WatchStatus device={device} /> : null}
    </View>
  );
}

const SECTIONS: readonly BuiltinSection[] = [
  {
    key: 'overview',
    title: 'Overview',
    icon: 'info',
    render: (device) => <OverviewDetails device={device} />,
  },
  {
    key: 'controls',
    title: 'All controls',
    icon: 'customize',
    render: (device, beside) => <ControlsSection device={device} beside={beside} />,
  },
  {
    key: 'history',
    title: 'History',
    icon: 'trendUp',
    render: (device) => <HistorySection device={device} />,
  },
  {
    key: 'activity',
    title: 'Activity',
    icon: 'activity',
    render: (device) => <ActivitySection device={device} />,
  },
  {
    key: 'remote',
    title: 'Remote',
    icon: 'remote',
    render: (device) => <RemoteSection device={device} />,
  },
];

function available(key: DeviceSectionKey, model: DeviceModel): boolean {
  switch (key) {
    case 'controls':
      return controlCount(model.presentation) > 0 || extrasOf(model.presentation).length > 0;
    case 'history':
      return historyMetrics(model.presentation, false).length > 0;
    case 'remote':
      return hasRemote(model.device);
    case 'overview':
    case 'activity':
      return true;
  }
}

export function sectionsOf(model: DeviceModel): readonly DeviceSection[] {
  return [
    ...SECTIONS.filter((section) => available(section.key, model)),
    ...pluginSectionsOf(model.device),
  ];
}

export function findSection(model: DeviceModel, key: string): DeviceSection | undefined {
  return sectionsOf(model).find((section) => section.key === key);
}

export function sectionOf(key: DeviceSectionKey): DeviceSection {
  const found = SECTIONS.find((section) => section.key === key);
  if (found === undefined) {
    throw new Error(`The device page has no ${key} section.`);
  }
  return found;
}
