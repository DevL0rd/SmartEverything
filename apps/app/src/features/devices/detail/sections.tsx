import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { DeviceFamily } from '@smarteverything/domain';
import type { AppHref } from '../../../components/app-href';
import { href } from '../../../app-shell/hrefs';
import type { IconName } from '../../../components/icon';
import { deviceValuesOf, type Device } from '../../../store/state';
import { controlCount, extrasOf, placesOwnCapabilities } from '../model/control-groups';
import type { DeviceModel } from '../model/device-model';
import { historyMetrics } from '../model/history-model';
import { BUTTONS_SECTION, isAppliance } from '../appliance/appliance-model';
import { ButtonsSection } from '../appliance/buttons-section';
import { BlasterDetails } from '../remote/blaster-details';
import { RemoteSection, hasRemote } from '../remote/remote-section';
import { ActivitySection } from './activity-section';
import { ControlsSection } from './controls-section';
import { HistorySection } from './history-section';
import { MaintenanceCard } from './maintenance-card';
import { ReadingGrid, hasReadings } from './reading-grid';
import { useDeviceModel } from '../model/device-model';
import { maintenanceOf } from '../model/maintenance';
import { useStoreSelector } from '../../../store/store-context';
import { DeviceLogCard } from '../log/device-log';
import { DiffuserDetails } from '../diffuser/diffuser-page';
import { GatewayChildren } from '../button/gateway-children';
import { MicrowaveDetails } from '../microwave/details';
import { ScaleDetails } from './scale-details';
import { WatchStatus, isLocalWatch } from '../../watches';
import { pluginOverviewsOf, pluginSectionsOf } from './plugin-sections';
import { arrangeSections, showsGenericReadings } from './section-order';

const LOGGED_FAMILIES: ReadonlySet<DeviceFamily> = new Set([
  'button',
  'switch',
  'plug',
  'diffuser',
]);

type DeviceSectionKey = 'overview' | 'controls' | 'buttons' | 'history' | 'activity' | 'remote';

export interface DeviceSection {
  readonly key: string;
  readonly title: string;
  readonly icon: IconName;
  readonly scrolls?: boolean;
  readonly render: (device: Device, beside: boolean) => ReactNode;
}

interface BuiltinSection extends DeviceSection {
  readonly key: DeviceSectionKey;
}

export function sectionHref(deviceId: string, key: string): AppHref {
  return href.deviceSection(deviceId, key);
}

export function useHasOverviewDetails(device: Device): boolean {
  const model = useDeviceModel(device);
  const details = useStoreSelector(
    (state) => {
      const values = deviceValuesOf(state, device.id);
      return hasReadings(model, values) || maintenanceOf(model, values).length > 0;
    },
    Object.is,
    [model, device.id],
  );
  return (
    model.family === 'scale' ||
    LOGGED_FAMILIES.has(model.family) ||
    model.family === 'gateway' ||
    model.family === 'ir_blaster' ||
    isLocalWatch(device) ||
    details ||
    pluginOverviewsOf(device).length > 0
  );
}

export function OverviewDetails({ device }: { readonly device: Device }): ReactNode {
  const model = useDeviceModel(device);
  const overviews = pluginOverviewsOf(device);
  return (
    <View className="gap-section-gap">
      {showsGenericReadings(overviews) ? <ReadingGrid device={device} /> : null}
      <MaintenanceCard device={device} />
      {model.family === 'scale' ? <ScaleDetails scale={device} /> : null}
      {model.family === 'gateway' ? <GatewayChildren device={device} /> : null}
      {model.family === 'ir_blaster' ? <BlasterDetails device={device} /> : null}
      {model.family === 'microwave' ? <MicrowaveDetails device={device} /> : null}
      {model.family === 'diffuser' ? <DiffuserDetails device={device} /> : null}
      {LOGGED_FAMILIES.has(model.family) ? <DeviceLogCard deviceId={device.id} /> : null}
      {isLocalWatch(device) ? <WatchStatus device={device} /> : null}
      {overviews.map((overview) => (
        <View key={overview.key}>{overview.render(device)}</View>
      ))}
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
    key: BUTTONS_SECTION,
    title: 'Buttons',
    icon: 'remote',
    render: (device) => <ButtonsSection device={device} />,
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
      return (
        !placesOwnCapabilities(model.family) &&
        (controlCount(model.presentation) > 0 || extrasOf(model.presentation).length > 0)
      );
    case 'history':
      return historyMetrics(model.presentation, false).length > 0;
    case 'buttons':
      return isAppliance(model.device);
    case 'remote':
      return hasRemote(model.device);
    case 'overview':
    case 'activity':
      return true;
  }
}

export function sectionsOf(model: DeviceModel): readonly DeviceSection[] {
  return arrangeSections(
    SECTIONS.filter((section) => available(section.key, model)),
    pluginSectionsOf(model.device),
  );
}
