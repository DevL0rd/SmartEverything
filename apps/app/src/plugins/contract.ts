import type { ReactNode } from 'react';
import type { PluginId } from '@smarteverything/domain';
import type { IconName } from '../components/icon';
import type { WidgetDefinition } from '../components/widget-board/types';
import type { Device } from '../store/state';

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

export interface AppPlugin {
  readonly id: PluginId;
  readonly widgets: readonly WidgetDefinition[];
  readonly home?: (devices: readonly Device[]) => readonly string[];
  readonly deviceSections: readonly PluginDeviceSection[];
  readonly deviceOverviews?: readonly PluginDeviceOverview[];
  readonly deviceSettings: readonly PluginDeviceSettingsBlock[];
  readonly settings: (() => ReactNode) | null;
}
