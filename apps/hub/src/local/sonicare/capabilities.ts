import {
  BRUSH_ACTIVITIES,
  BRUSH_HEADS,
  BRUSH_HEAD_TYPES,
  BRUSH_INTENSITIES,
  BRUSH_LINK_PHASES,
  BRUSH_SESSION_STATES,
  modesOfRoutines,
  type SonicareIdentity,
  type BrushMode,
  type SonicareProfile,
  type DeviceCapability,
} from '@smarteverything/domain';

const ALL_MODES: readonly BrushMode[] = [
  'clean',
  'white_plus',
  'gum_health',
  'tongue_care',
  'deep_clean_plus',
  'sensitive',
];

const WRITABLE_MODES: readonly BrushMode[] = [
  'clean',
  'white_plus',
  'gum_health',
  'deep_clean_plus',
  'sensitive',
];

const MAX_HOURS = 1_000_000;

type Access = DeviceCapability['access'];

function choice(
  key: DeviceCapability['key'],
  label: string,
  access: Access,
  options: readonly string[],
): DeviceCapability {
  return { key, label, access, value: { kind: 'enum', options: [...options] } };
}

function figure(
  key: DeviceCapability['key'],
  label: string,
  range: { readonly max: number; readonly unit: string },
): DeviceCapability {
  return {
    key,
    label,
    access: 'read',
    value: { kind: 'number', min: 0, max: range.max, step: 1, unit: range.unit },
  };
}

function toggle(key: DeviceCapability['key'], label: string): DeviceCapability {
  return { key, label, access: 'read_write', value: { kind: 'boolean' } };
}

export function availableModes(
  profile: SonicareProfile,
  identity: SonicareIdentity,
): readonly BrushMode[] {
  if (profile.writes) {
    return WRITABLE_MODES;
  }
  const listed = identity.routineIds === null ? [] : modesOfRoutines(identity.routineIds);
  return listed.length === 0 ? ALL_MODES : listed;
}

function brushing(profile: SonicareProfile, identity: SonicareIdentity): DeviceCapability[] {
  const access: Access = profile.writes ? 'read_write' : 'read';
  return [
    choice('brush_activity', 'Toothbrush', 'read', BRUSH_ACTIVITIES),
    choice('brush_session', 'Brushing session', 'read', BRUSH_SESSION_STATES),
    choice('brush_mode', 'Brushing mode', access, availableModes(profile, identity)),
    choice('brush_intensity', 'Brushing intensity', access, BRUSH_INTENSITIES),
    figure('brush_routine_seconds', 'Routine length', { max: 3600, unit: 's' }),
    {
      key: 'battery',
      label: 'Battery',
      access: 'read',
      value: { kind: 'number', min: 0, max: 100, step: 1, unit: '%' },
    },
    choice('brush_link', 'Brush connection', 'read', BRUSH_LINK_PHASES),
    { key: 'brush_fault', label: 'Brush fault', access: 'read', value: { kind: 'boolean' } },
  ];
}

function head(profile: SonicareProfile): DeviceCapability[] {
  if (profile.head === 'none') {
    return [];
  }
  return [
    choice('brush_head', 'Brush head', 'read', BRUSH_HEADS),
    figure('brush_head_wear', 'Brush head wear', { max: 100, unit: '%' }),
    figure('brush_head_sessions_left', 'Brush head sessions left', { max: 1000, unit: 'sessions' }),
    ...(profile.head === 'full'
      ? [choice('brush_head_type', 'Brush head type', 'read', BRUSH_HEAD_TYPES)]
      : []),
  ];
}

function feedback(profile: SonicareProfile): DeviceCapability[] {
  return profile.settingsWrite
    ? [
        toggle('brush_feedback_pressure', 'Pressure feedback'),
        toggle('brush_feedback_scrubbing', 'Scrubbing feedback'),
        toggle('brush_adaptive_intensity', 'Adaptive intensity'),
      ]
    : [];
}

function motor(profile: SonicareProfile): DeviceCapability[] {
  return profile.motorRuntime
    ? [figure('brush_motor_hours', 'Motor hours', { max: MAX_HOURS, unit: 'h' })]
    : [];
}

export function brushCapabilities(
  profile: SonicareProfile,
  identity: SonicareIdentity,
): DeviceCapability[] {
  return [
    ...brushing(profile, identity),
    ...head(profile),
    ...feedback(profile),
    ...motor(profile),
  ];
}
