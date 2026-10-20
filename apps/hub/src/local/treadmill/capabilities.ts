import {
  BELT_COMMANDS,
  BELT_MODES,
  BELT_LINK_PHASES,
  BELT_STATES,
  MAX_BELT_KMH,
  MIN_BELT_KMH,
  BELT_STEP_KMH,
  PAD_GOAL_KINDS,
  PAD_SENSITIVITIES,
  PANEL_BUTTONS,
  type DeviceCapability,
  type TreadmillFamily,
  type TreadmillIdentity,
} from '@smarteverything/domain';

const MODES = ['manual', 'auto', 'standby'] as const;

const INCLINE_FALLBACK_STEP = 0.1;

const MAX_SECONDS = 359_999;

const MAX_METRES = 1_000_000;

const MAX_STEPS = 1_000_000;

const MAX_PACE_SECONDS = 7200;

const MAX_CADENCE = 300;

const MAX_GOAL = 100_000;

type Access = DeviceCapability['access'];

function number(
  key: DeviceCapability['key'],
  label: string,
  access: Access,
  range: {
    readonly min: number;
    readonly max: number;
    readonly step: number;
    readonly unit: string;
  },
): DeviceCapability {
  return { key, label, access, value: { kind: 'number', ...range } };
}

function choice(
  key: DeviceCapability['key'],
  label: string,
  access: Access,
  options: readonly string[],
): DeviceCapability {
  return { key, label, access, value: { kind: 'enum', options: [...options] } };
}

function toggle(key: DeviceCapability['key'], label: string): DeviceCapability {
  return { key, label, access: 'read_write', value: { kind: 'boolean' } };
}

function limits(identity: TreadmillIdentity): { min: number; max: number; step: number } {
  return {
    min: identity.speedMinKmh ?? MIN_BELT_KMH,
    max: identity.speedMaxKmh ?? MAX_BELT_KMH,
    step: identity.speedStepKmh ?? BELT_STEP_KMH,
  };
}

function modeOf(family: TreadmillFamily): DeviceCapability {
  return family === 'wilink'
    ? choice('belt_mode', 'Belt mode', 'read_write', MODES)
    : choice('belt_mode', 'Belt mode', 'read', BELT_MODES);
}

function belt(family: TreadmillFamily, identity: TreadmillIdentity): DeviceCapability[] {
  const speed = limits(identity);
  const panelButton =
    family === 'wilink' ? [choice('button', 'Panel button', 'read', PANEL_BUTTONS)] : [];
  return [
    choice('belt_state', 'Belt', 'read', BELT_STATES),
    choice('belt_command', 'Belt control', 'write', BELT_COMMANDS),
    number('belt_speed', 'Belt speed', 'read_write', { ...speed, unit: 'km/h' }),
    number('belt_target_speed', 'Target speed', 'read', { ...speed, unit: 'km/h' }),
    modeOf(family),
    choice('belt_link', 'Bluetooth link', 'read', BELT_LINK_PHASES),
    ...panelButton,
  ];
}

function session(): DeviceCapability[] {
  return [
    number('session_time', 'Session time', 'read', {
      min: 0,
      max: MAX_SECONDS,
      step: 1,
      unit: 's',
    }),
    number('session_distance', 'Session distance', 'read', {
      min: 0,
      max: MAX_METRES,
      step: 1,
      unit: 'm',
    }),
    number('session_steps', 'Session steps', 'read', {
      min: 0,
      max: MAX_STEPS,
      step: 1,
      unit: 'steps',
    }),
    number('session_pace', 'Pace', 'read', {
      min: 0,
      max: MAX_PACE_SECONDS,
      step: 1,
      unit: 's/km',
    }),
    number('session_cadence', 'Cadence', 'read', {
      min: 0,
      max: MAX_CADENCE,
      step: 1,
      unit: 'steps/min',
    }),
  ];
}

function inclineOf(family: TreadmillFamily, identity: TreadmillIdentity): DeviceCapability[] {
  const { inclineMinPercent: min, inclineMaxPercent: max } = identity;
  const capable = identity.features.includes('inclination');
  return capable && min !== null && max !== null && max > 0
    ? [
        number(
          'belt_incline',
          'Incline',
          family === 'ftms' || family === 'ftms_supplement' ? 'read_write' : 'read',
          {
            min,
            max,
            step: identity.inclineStepPercent ?? INCLINE_FALLBACK_STEP,
            unit: '%',
          },
        ),
      ]
    : [];
}

function goal(): DeviceCapability[] {
  return [
    choice('belt_goal', 'Belt goal', 'read_write', PAD_GOAL_KINDS),
    number('belt_goal_value', 'Belt goal value', 'read_write', {
      min: 0,
      max: MAX_GOAL,
      step: 1,
      unit: 'm, kcal or s',
    }),
  ];
}

function pad(identity: TreadmillIdentity): DeviceCapability[] {
  const speed = limits(identity);
  return [
    number('belt_max_speed', 'Maximum speed', 'read_write', { ...speed, unit: 'km/h' }),
    number('belt_start_speed', 'Start speed', 'read_write', { ...speed, unit: 'km/h' }),
    toggle('belt_auto_start', 'Auto start'),
    choice('belt_sensitivity', 'Auto sensitivity', 'read_write', PAD_SENSITIVITIES),
    toggle('child_lock', 'Child lock'),
  ];
}

function supplementPad(identity: TreadmillIdentity): DeviceCapability[] {
  const speed = limits(identity);
  return [
    number('belt_max_speed', 'Maximum speed', 'read_write', { ...speed, unit: 'km/h' }),
    toggle('child_lock', 'Child lock'),
    toggle('buzzer', 'Button sounds'),
    toggle('belt_light', 'Light strip'),
  ];
}

function padOf(family: TreadmillFamily, identity: TreadmillIdentity): DeviceCapability[] {
  switch (family) {
    case 'wilink':
      return [...goal(), ...pad(identity)];
    case 'ftms_supplement':
      return supplementPad(identity);
    case 'ftms':
    case 'ftms_odm':
      return [];
  }
}

export function treadmillCapabilities(
  family: TreadmillFamily,
  identity: TreadmillIdentity,
): DeviceCapability[] {
  return [
    ...belt(family, identity),
    ...session(),
    ...inclineOf(family, identity),
    ...padOf(family, identity),
  ];
}
