import type { ReactNode } from 'react';
import type { PluginId } from '@smarteverything/domain';
import type { IconName } from '../components/icon';
import type { WidgetFrameBox } from '../components/widget-board/frame-class';
import type { WidgetDefinition } from '../components/widget-board/types';
import type { Device, StoreState } from '../store/state';
import type { DevicePageContribution } from '../app-shell/device-pages';

interface PluginDeviceSection {
  readonly key: string;
  readonly order?: number;
  readonly title: string;
  readonly icon?: IconName;
  readonly scrolls?: boolean;
  readonly applies: (device: Device) => boolean;
  readonly render: (device: Device, beside: boolean) => ReactNode;
}

export interface PluginDeviceOverview {
  readonly key: string;
  readonly replacesReadings?: boolean;
  readonly applies: (device: Device) => boolean;
  readonly render: (device: Device) => ReactNode;
}

export interface PluginDeviceSettingsBlock {
  readonly key: string;
  readonly applies: (device: Device) => boolean;
  readonly render: (device: Device) => ReactNode;
}

export interface PluginDeviceCard {
  readonly groupChildren?: boolean;
  readonly key: string;
  readonly applies: (device: Device) => boolean;
  readonly render: (device: Device, size: string, showRoom: boolean) => ReactNode;
  readonly cell?: (device: Device, frame: WidgetFrameBox, size: string) => ReactNode;
  readonly quick?: (device: Device) => ReactNode;
  readonly subtitle?: (device: Device) => ReactNode;
  readonly hero?: (device: Device) => ReactNode;
  readonly notice?: (device: Device) => ReactNode;
}

export interface PluginDevicePage extends DevicePageContribution {
  readonly applies: (device: Device) => boolean;
  readonly render: (device: Device) => ReactNode;
}

interface PluginDevicePages {
  readonly pages: readonly PluginDevicePage[];
  readonly search?: (
    device: Device,
    streams: StoreState['tables']['plugin_streams'],
  ) => readonly PluginDeviceSearchItem[];
}

export interface PluginDeviceSearchItem {
  readonly query?: Readonly<Record<string, string>>;
  readonly id: string;
  readonly title: string;
  readonly page: string;
  readonly focus: string;
  readonly keywords: readonly string[];
  readonly icon: IconName;
  readonly group: 'setting' | 'action';
}

export interface AppPlugin {
  readonly id: PluginId;
  readonly widgets: readonly WidgetDefinition[];
  readonly home?: (devices: readonly Device[], profileId: string | null) => readonly string[];
  readonly widgetAliases?: Readonly<Record<string, string>>;
  readonly deviceCards?: readonly PluginDeviceCard[];
  readonly devicePages?: PluginDevicePages;
  readonly deviceSections: readonly PluginDeviceSection[];
  readonly deviceOverviews?: readonly PluginDeviceOverview[];
  readonly deviceSettings: readonly PluginDeviceSettingsBlock[];
  readonly settingsSearch?: readonly {
    readonly id: string;
    readonly title: string;
    readonly keywords: readonly string[];
  }[];
  readonly settings: (() => ReactNode) | null;
}
