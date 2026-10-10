import type { ReactNode } from 'react';
import type { Href } from 'expo-router';
import type { ConfirmRequest } from '../components/confirm-store';
import type { IconName } from '../components/icon';
import type { SelectOption } from '../components/select-picker';
import type { AppPlatform } from '../design/platform';
import type { EntityStore } from '../store/entity-store';
import type { Availability } from '../store/selectors';
import type { StoreState } from '../store/state';

type SettingScope = 'server' | 'client' | 'device-local' | 'device';

export interface SettingEnv {
  readonly owner: boolean;
  readonly platform: AppPlatform;
  readonly availability: Availability;
}

export interface SettingContext {
  readonly state: StoreState;
  readonly store: EntityStore;
}

interface SettingBase {
  readonly id: string;
  readonly page: string;
  readonly section?: string;
  readonly title: string;
  readonly description?: string;
  readonly icon?: IconName;
  readonly keywords: readonly string[];
  readonly scope: SettingScope;
  readonly visible?: (env: SettingEnv) => boolean;
  readonly when?: (state: StoreState) => boolean;
  readonly beforeSubPages?: boolean;
}

export interface SwitchSetting extends SettingBase {
  readonly control: 'switch';
  readonly read: (state: StoreState) => boolean;
  readonly write: (value: boolean, context: SettingContext) => Promise<void>;
}

export interface SelectSetting extends SettingBase {
  readonly control: 'select';
  readonly options: readonly SelectOption<string>[];
  readonly searchable?: boolean;
  readonly inline?: boolean;
  readonly read: (state: StoreState) => string;
  readonly write: (value: string, context: SettingContext) => Promise<void>;
}

export interface StepperSetting extends SettingBase {
  readonly control: 'stepper';
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly unit?: string;
  readonly format?: (value: number) => string;
  readonly read: (state: StoreState) => number;
  readonly write: (value: number, context: SettingContext) => Promise<void>;
}

interface TextSetting extends SettingBase {
  readonly control: 'text';
  readonly placeholder: string;
  readonly maxLength: number;
  readonly read: (state: StoreState) => string;
  readonly write: (value: string, context: SettingContext) => Promise<void>;
}

interface LinkSetting extends SettingBase {
  readonly control: 'link';
  readonly href: Href;
  readonly value?: (state: StoreState) => string | null;
}

interface ActionSetting extends SettingBase {
  readonly control: 'action';
  readonly destructive?: boolean;
  readonly confirm?: ConfirmRequest;
  readonly run: (context: SettingContext) => Promise<void>;
}

interface ListedSetting extends SettingBase {
  readonly control: 'listed';
  readonly in: string;
}

interface CustomSetting extends SettingBase {
  readonly control: 'custom';
  readonly row?: boolean;
  readonly render: () => ReactNode;
}

export type SettingDefinition =
  | SwitchSetting
  | SelectSetting
  | StepperSetting
  | TextSetting
  | LinkSetting
  | ActionSetting
  | ListedSetting
  | CustomSetting;

type SettingsGroup = 'Home' | 'Connections' | 'App' | 'System';

export interface SettingsPageDefinition {
  readonly id: string;
  readonly title: string;
  readonly icon: IconName;
  readonly parent: string | null;
  readonly group: SettingsGroup | null;
  readonly summary?: (state: StoreState) => string | null;
  readonly subtitle?: string;
  readonly visible?: (env: SettingEnv) => boolean;
  readonly platform?: AppPlatform;
  readonly keywords: readonly string[];
  readonly href?: Href;
  readonly subPagesFirst?: boolean;
  readonly childrenInline?: boolean;
}
