import type {
  BrushBrand,
  BrushIntensity,
  BrushLiveFrame,
  BrushMode,
  BrushPressure,
  BrushProfile,
  BrushStateView,
  BrushingSession,
  BrushingStats,
} from '@smarteverything/domain';
import type { ComponentType } from 'react';
import type { BadgeTone } from '../../components/badge';
import type { IconName } from '../../components/icon';
import type { ColourRole } from '../../design/tokens';
import type { Device } from '../../store/state';
import type { SettingRow } from './model/search-rows';
import type { SetupState, SetupStep } from './model/setup-model';
import type { SettingsProps } from './settings/settings-props';
import type { Progress } from './setup/use-setup';

export interface PressureLook {
  readonly label: string;
  readonly tone: BadgeTone;
  readonly icon: IconName;
  readonly colour: ColourRole;
  readonly opacity: number;
}

export interface DeviceProps {
  readonly deviceId: string;
  readonly view: BrushStateView;
}

export interface RestHeroProps extends DeviceProps {
  readonly session: BrushingSession;
}

export interface WidgetFaceProps {
  readonly device: Device;
  readonly view: BrushStateView;
  readonly frame: BrushLiveFrame;
}

export interface IntensityProps {
  readonly intensity: BrushIntensity | null;
}

export interface StatsProps {
  readonly deviceId: string;
  readonly stats: BrushingStats;
  readonly profile: BrushProfile;
}

export interface DiagnosticsProps {
  readonly deviceId: string;
  readonly mayConfigure: boolean;
}

export interface RecapProps {
  readonly session: BrushingSession;
  readonly profile: BrushProfile;
}

export interface PairStepProps {
  readonly state: SetupState;
  readonly progress: Progress;
  readonly onPair: () => void;
}

export interface SetupUi {
  readonly steps: readonly SetupStep[];
  readonly PairStep: ComponentType<PairStepProps> | null;
}

export interface ModelChoice {
  readonly value: string;
  readonly label: string;
}

export interface BrushBrandUi {
  readonly label: string;
  readonly keywords: readonly string[];
  readonly modeColour: (mode: BrushMode) => ColourRole;
  readonly pressure: Readonly<Record<BrushPressure, PressureLook>>;
  readonly modelChoices: readonly ModelChoice[];
  readonly HeroStage: ComponentType<DeviceProps> | null;
  readonly RestHero: ComponentType<RestHeroProps> | null;
  readonly WidgetFace: ComponentType<WidgetFaceProps> | null;
  readonly StageExtras: ComponentType<IntensityProps> | null;
  readonly Recap: ComponentType<RecapProps> | null;
  readonly HandleStrip: ComponentType<DeviceProps> | null;
  readonly HeadCard: ComponentType<DeviceProps> | null;
  readonly CareCards: ComponentType<DeviceProps> | null;
  readonly StatsExtras: ComponentType<StatsProps> | null;
  readonly HandleSettings: ComponentType<SettingsProps> | null;
  readonly Diagnostics: ComponentType<DiagnosticsProps> | null;
  readonly setupSteps: SetupUi;
  readonly SetupFlow: ComponentType | null;
  readonly searchRows: readonly SettingRow[];
}

export type BrushBrandRegistry = Readonly<Record<BrushBrand, BrushBrandUi>>;
