import type { ReactNode } from 'react';
import type { PluginId } from '@smarteverything/domain';
import type { IconName } from '../components/icon';
import type { WidgetDefinition } from '../components/widget-board/types';
import type { Device, StoreState } from '../store/state';

export interface PluginDeviceSection {
  readonly key: string;
  readonly title: string;
  readonly icon?: IconName;
  readonly applies: (device: Device) => boolean;
  readonly render: (device: Device, beside: boolean) => ReactNode;
}

export interface PluginDeviceOverview {
  readonly key: string;
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
  readonly hero?: (device: Device) => ReactNode;
}

export interface PluginDeviceSettingsPage {
  readonly id: string;
  readonly applies: (device: Device) => boolean;
  readonly render: (device: Device) => ReactNode;
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
  readonly home?: (devices: readonly Device[]) => readonly string[];
  readonly deviceSearch?: (
    device: Device,
    streams: StoreState['tables']['plugin_streams'],
  ) => readonly PluginDeviceSearchItem[];
  readonly deviceCards?: readonly PluginDeviceCard[];
  readonly deviceSettingsPages?: readonly PluginDeviceSettingsPage[];
  readonly deviceSections: readonly PluginDeviceSection[];
  readonly deviceOverviews?: readonly PluginDeviceOverview[];
  readonly deviceSettings: readonly PluginDeviceSettingsBlock[];
  readonly settingsSearch?: readonly {
    readonly id: string;
    readonly title: string;
    readonly focus: string;
    readonly keywords: readonly string[];
  }[];
  readonly settings: (() => ReactNode) | null;
}
