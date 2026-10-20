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
export { AIR_BANDS, AIR_BAND_LABELS, PM25_UPPER_BOUNDS, airBand } from './presentation/air';
export { isPrivate, privacySwitchOf } from './presentation/camera-privacy';
export { readPresentedColor, writePresentedColor } from './presentation/color';
export { hsvToPackedRgb, hsvToRgbChannels, packedRgbToHsv, rgbChannelsToHsv } from './color';
export type { RgbChannels } from './color';
export { COLOR_INPUT_FORMS, colorFromInput, kelvinFromText } from './color-input';
export type { PrivacySwitch } from './presentation/camera-privacy';
export type { AirBand } from './presentation/air';
export { dangerOf } from './presentation/danger';
export { familyDefinition, isBleObservable, isLiveControl } from './presentation/families';
export type { FamilyDefinition, GlowTone, SummaryPart } from './presentation/families';
export { CLIMATE_FAMILIES, deviceFamily, sleepsBetweenUse } from './presentation/device-family';
export { friendlyUnit, humanizeEnum, humanizeKey } from './presentation/humanize';
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
  ColorEncoding,
} from './presentation/types';

export {
  DEVICE_KIND_LABELS,
  baseNameOf,
  replacedIds,
  roomNameOf,
  isCamera,
  isClimateAppliance,
  isClimateDevice,
  isScale,
  isWearable,
} from './device-kinds';
export type { NamedDevice, NamedRoom } from './device-kinds';

export {
  CAMERA_DETECTION_PRESENTATIONS,
  EVENT_KIND_LABELS,
  LAUNDRY_EVENT_FAMILY,
  eventKeywords,
  eventLabel,
} from './event-labels';

export {
  ADDABLE_PROVIDERS,
  PROVIDER_INFO,
  XIAOMI_REGION_LABELS,
  xiaomiRegionFor,
} from './providers-info';
export type { ProviderInfo, ProviderInfos, XiaomiInfo, XiaomiRegion } from './providers-info';

export {
  ACCENTS,
  AMBIENT_BACKGROUNDS,
  APPEARANCE_PREF,
  APPEARANCE_PREF_CHOICES,
  CALL_AUDIO_PREF,
  CALL_FACINGS,
  CALL_RING_PREF,
  CAMERAS_PREF,
  CLIENT_PREFS,
  CLIENT_PREF_KEYS,
  CORNER_STYLES,
  DENSITY_STYLES,
  ECHO_TEST_OUTCOMES,
  HEALTH_SYNC_INTERVALS,
  HEALTH_SYNC_PREF,
  LAYOUT_SCOPES,
  MOTION_STYLES,
  RESERVED_LAYOUT_KEYS,
  SURFACE_STYLES,
  THEMES,
  callAudioWith,
  layoutScopeOf,
} from './client-prefs';
export {
  CAMERA_COOLDOWN_CHOICES,
  CAMERA_COOLDOWN_DEFAULT_MINUTES,
  CAMERA_NOTIFICATIONS_PREF,
  CAMERA_NOTIFICATION_DEFAULTS,
  CAMERA_NOTIFICATION_HINTS,
  CAMERA_NOTIFICATION_KINDS,
  CAMERA_NOTIFICATION_LABELS,
  CAMERA_OFFLINE_REPEAT_MINUTES,
  CAMERA_QUIET_HOURS,
  DEFAULT_CAMERA_NOTIFICATIONS,
  cameraCooldownMinutes,
  cameraNotificationOverride,
  cameraNotificationOn,
  cameraQuietHours,
  inQuietHours,
  withCameraCooldown,
  withCameraNotification,
  withCameraQuiet,
} from './camera-notifications';
export type {
  CameraNotificationKind,
  CameraNotificationOverride,
  CameraNotificationsPref,
  CameraQuietHours,
} from './camera-notifications';
export { DEVICE_ALERTS_PREF, deviceAlertsOn, withDeviceAlerts } from './device-alerts';
export type { DeviceAlertsPref } from './device-alerts';
export { CLIPBOARD_CLIP, CLIPBOARD_NOTICE, SHARED_CLIPBOARD_PREF } from './shared-clipboard';
export type { ClipboardClip, ClipboardNotice, SharedClipboardPref } from './shared-clipboard';
export type {
  AiSpeechPref,
  AppearancePref,
  CallAudio,
  CallAudioPref,
  CallRingPref,
  CamerasPref,
  ClientPrefDefinition,
  ClientPrefKey,
  ClientPrefRead,
  ClientPrefValue,
  EchoTestOutcome,
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
  WIDGET_SIZE,
  WIDGET_SIZES,
  WIDGET_TYPE,
  readBoardLayout,
  withKnownWidgets,
} from './board-layout';
export {
  arrangementOf,
  withWidgetOverlaid,
  arrangementSourceOf,
  withArrangementFor,
  withCopiedArrangement,
  withDefaultArrangement,
  withFollowing,
  withoutArrangementFor,
  withUndone,
} from './board-layout-actions';
export type { ArrangementSource, BoardDefaultWidgets } from './board-layout-actions';
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
