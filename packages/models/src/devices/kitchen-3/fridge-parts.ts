import type { ModelSpecChannel, ModelSpecShot } from '@smarteverything/domain';
import { COOL, DAYLIGHT, FAULT, WARNING, glow, look, offline, pulse } from '../kitchen-2/look';

export const FRIDGE_MATERIALS = {
  trim: { finish: 'graphite' },
  glass: { finish: 'smoked-acrylic' },
  accent: { color: COOL, roughness: 0.3, opacity: 0 },
} as const;

export function fridgeChannels(doors: readonly string[]): ModelSpecChannel[] {
  return [
    ...doors.map((door) =>
      look(
        `${door}Pose`,
        [door, 'pose'],
        ['door', { open: 'open', closed: 'closed', locked: 'closed' }],
        650,
      ),
    ),
    ...glow(
      'interior',
      'interior',
      ['door', { open: 0.95, closed: 0, locked: 0 }, { open: 1.1, closed: 0, locked: 0 }],
      450,
    ),
    look('interiorTint', ['interior', 'colour'], ['door', { open: DAYLIGHT }], 250),
    look(
      'interiorLampLit',
      ['interiorLamp', 'emissive'],
      ['door', { open: 0.8, closed: 0, locked: 0 }],
      450,
    ),
    look('interiorLampOffline', ['interiorLamp', 'emissive'], ['online', { false: 0 }], 450),
    ...offline('interior'),
    ...glow('display', 'displayGlow', ['online', { true: 1, false: 0 }, { true: 0.9, false: 0 }]),
    look(
      'displayCool',
      ['displayGlow', 'colour'],
      ['thermal', { cooling: COOL, idle: COOL, heating: WARNING }],
      250,
    ),
    look('displayAlarm', ['displayGlow', 'colour'], ['alarm', { true: WARNING }], 250),
    pulse('displayAlarmPulse', ['displayGlow', 'emissive'], ['alarm', { true: 1 }], [1, 0.5]),
    look('displayFault', ['displayGlow', 'colour'], ['fault', { true: FAULT }], 250),
    ...offline('displayGlow'),
  ];
}

export const FRIDGE_SHOTS: ModelSpecShot[] = [
  {
    id: 'alarm',
    when: { anyOf: [{ allOf: [{ signal: 'alarm', op: 'eq', value: true }] }] },
    focus: 'display',
    zoom: 1.5,
    yaw: 24,
    pitch: 10,
    easeMs: 800,
    loopS: 1,
    symmetry: 360,
    stillAt: 0.25,
  },
  {
    id: 'open',
    when: { anyOf: [{ allOf: [{ signal: 'door', op: 'eq', value: 'open' }] }] },
    focus: 'interior',
    zoom: 1.15,
    yaw: 18,
    pitch: 8,
    easeMs: 1000,
    loopS: 1,
    symmetry: 360,
    stillAt: 0,
  },
];

export const FRIDGE_STATES = {
  closed: { door: 'closed', thermal: 'cooling', online: true },
  idle: { door: 'closed', thermal: 'idle', online: true },
  open: { door: 'open', thermal: 'cooling', online: true },
  doorAlarm: { door: 'open', alarm: true, online: true },
  fault: { door: 'closed', fault: true, online: true },
  offline: { online: false },
};
