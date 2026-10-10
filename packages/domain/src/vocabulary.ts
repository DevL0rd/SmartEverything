export {
  CURATED_CONTROL_LIMIT,
  curatedControls,
  inTier,
  pickableControls,
  presentCapability,
  presentDevice,
  presentValue,
  withRole,
} from './capability-presentation';
export { AIR_BANDS, AIR_BAND_LABELS, airBand } from './presentation/air';
export { isPrivate, privacySwitchOf } from './presentation/camera-privacy';
export type { PrivacySwitch } from './presentation/camera-privacy';
export type { AirBand } from './presentation/air';
export { dangerOf } from './presentation/danger';
export { CLIMATE_FAMILIES, deviceFamily, sleepsBetweenUse } from './presentation/device-family';
export { friendlyUnit, humanizeEnum } from './presentation/humanize';
export { MODEL_OVERRIDES } from './presentation/overrides/index';
export { CAPABILITY_GROUP_LABELS, ROLE_ORDER, STANDARD_TIERS } from './presentation/standard';
export { DEVICE_FAMILIES, EXTRA_ROLES, PRESENTATION_TIERS } from './presentation/types';
export type {
  CapabilityOverride,
  CapabilityPresentation,
  CapabilityRole,
  Danger,
  DeviceFamily,
  DevicePresentation,
  EnumOption,
  ExtraRole,
  ModelOverride,
  PresentableDevice,
  PresentableDeviceWithCapabilities,
  PresentationTier,
  PresentedCapability,
  BooleanStates,
  ClockText,
} from './presentation/types';

export {
  DEVICE_KIND_LABELS,
  baseNameOf,
  displayName,
  replacedIds,
  roomNameOf,
  isCamera,
  isClimateAppliance,
  isClimateDevice,
  isScale,
  isWearable,
} from './device-kinds';
export type { NamedDevice, NamedRoom } from './device-kinds';

export { EVENT_KIND_LABELS } from './event-labels';

export {
  ADDABLE_PROVIDERS,
  PROVIDER_INFO,
  TUYA_REGION_LABELS,
  XIAOMI_REGION_LABELS,
  xiaomiRegionFor,
} from './providers-info';
export type {
  ProviderInfo,
  ProviderInfos,
  TuyaRegion,
  XiaomiInfo,
  XiaomiRegion,
} from './providers-info';

export {
  ACCENTS,
  AMBIENT_BACKGROUNDS,
  APPEARANCE_PREF,
  APPEARANCE_PREF_CHOICES,
  CALL_RING_PREF,
  CAMERAS_PREF,
  CAMERA_AWAY_MODES,
  CLIENT_PREFS,
  CLIENT_PREF_KEYS,
  CORNER_STYLES,
  DENSITY_STYLES,
  HEALTH_SYNC_INTERVALS,
  HEALTH_SYNC_PREF,
  LAYOUT_SCOPES,
  MOTION_STYLES,
  RESERVED_LAYOUT_KEYS,
  SURFACE_STYLES,
  THEMES,
  layoutScopeOf,
} from './client-prefs';
export type {
  AppearancePref,
  CallRingPref,
  CamerasPref,
  ClientPrefDefinition,
  ClientPrefKey,
  ClientPrefRead,
  ClientPrefValue,
  HealthSyncPref,
  LayoutScope,
} from './client-prefs';

export {
  BOARD_ARRANGEMENT,
  BOARD_CLASSES,
  BOARD_COLUMNS,
  BOARD_LAYOUT,
  BOARD_LAYOUT_VERSION,
  BOARD_WIDGET,
  WIDGET_FOOTPRINTS,
  WIDGET_KEY,
  WIDGET_SIZES,
  WIDGET_TYPE,
  migrateLayout,
  readBoardLayout,
  withArrangementFor,
  withKnownWidgets,
} from './board-layout';
export type {
  BoardArrangement,
  BoardClass,
  BoardLayout,
  BoardLayoutRead,
  BoardWidget,
  KnownWidgets,
  WidgetFootprint,
  WidgetSize,
} from './board-layout';

export {
  FITNESS_GOALS,
  FITNESS_GOAL_KEYS,
  FITNESS_GOAL_LIMITS,
  FITNESS_SETTINGS_CHANGE,
  MAX_HEART_RATE,
  MAX_HEART_RATE_LIMITS,
  UNSET_FITNESS_GOALS,
  effectiveFitnessGoals,
} from './fitness-settings';
export type {
  EffectiveFitnessGoals,
  FitnessGoalKey,
  FitnessGoalLimit,
  FitnessGoals,
  FitnessSettingsChange,
} from './fitness-settings';
