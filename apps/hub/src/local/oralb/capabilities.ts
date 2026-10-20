import {
  BRUSH_ACTIVITIES,
  BRUSH_LINK_PHASES,
  BRUSH_SESSION_STATES,
  HEAD_REMINDERS,
  ORALB_MODES,
  ORALB_RING_VALUES,
  type DeviceCapability,
  type OralbProbe,
} from '@smarteverything/domain';
import type { LocalDeviceEntry } from '../../store/repositories/local-devices';
import { entryProfileOf, identityOf, oralbSettingsOf } from './config';
import { writeOpen } from './probes-state';

export const QUADRANT_SECONDS = { min: 5, max: 120 } as const;

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
  range: { readonly min: number; readonly max: number; readonly unit: string },
  access: Access = 'read',
): DeviceCapability {
  return { key, label, access, value: { kind: 'number', step: 1, ...range } };
}

export function oralbCapabilities(entry: LocalDeviceEntry): DeviceCapability[] {
  const profile = entryProfileOf(entry);
  const settings = oralbSettingsOf(entry);
  const { firmware } = identityOf(entry);
  const accessOf = (probe: OralbProbe): Access =>
    writeOpen(settings, probe, firmware) ? 'read_write' : 'read';
  return [
    choice('brush_activity', 'Toothbrush', 'read', BRUSH_ACTIVITIES),
    choice('brush_session', 'Brushing session', 'read', BRUSH_SESSION_STATES),
    choice('brush_mode', 'Brushing mode', 'read', ORALB_MODES),
    figure('brush_routine_seconds', 'Routine length', { min: 0, max: 3600, unit: 's' }),
    {
      key: 'battery',
      label: 'Battery',
      access: 'read',
      value: { kind: 'number', min: 0, max: 100, step: 1, unit: '%' },
    },
    choice('brush_link', 'Brush connection', 'read', BRUSH_LINK_PHASES),
    {
      key: 'brush_pacer',
      label: 'Brushing pacer',
      access: accessOf('pacer_write'),
      value: { kind: 'boolean' },
    },
    figure(
      'brush_quadrant_seconds',
      'Seconds per quadrant',
      { ...QUADRANT_SECONDS, unit: 's' },
      accessOf('pacer_write'),
    ),
    ...(profile.ring
      ? [choice('brush_ring_colour', 'Ring colour', accessOf('ring_write'), ORALB_RING_VALUES)]
      : []),
    ...(profile.battery === 'percent'
      ? []
      : [figure('brush_charge_runtime', 'Charge runtime', { min: 0, max: 86_400, unit: 's' })]),
    ...(profile.head === 'countdown'
      ? [
          figure('brush_head_days_left', 'Brush head days left', { min: 0, max: 3650, unit: 'd' }),
          figure('brush_head_wear', 'Brush head wear', { min: 0, max: 100, unit: '%' }),
          figure('brush_head_sessions_left', 'Brush head sessions left', {
            min: 0,
            max: 1000,
            unit: 'sessions',
          }),
          choice('brush_head_reminder', 'Brush head reminder', 'read', HEAD_REMINDERS),
        ]
      : []),
  ];
}
