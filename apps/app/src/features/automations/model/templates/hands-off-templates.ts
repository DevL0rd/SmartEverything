import type { AutomationV3 } from '@smarteverything/domain';
import { MINUTE_MS, automation, lit, type Maker } from './build';
import {
  choicesOf,
  devicesSlot,
  numberSlot,
  roomSlot,
  template,
  type Template,
  type TemplateDevice,
  type TemplateRoom,
  type Use,
} from './parameters';
import { stateSignal } from './parts';
import { allLights, idsOf, isReadable, labelsOf, lightsOf, withCapability } from './picks';

export function lightsOffAfterMotion(devices: readonly TemplateDevice[]): Template[] {
  const lights = lightsOf(devices);
  const sensor = withCapability(devices, 'motion', isReadable)[0];
  const first = lights[0];
  if (first === undefined || sensor === undefined) return [];
  return [
    template({
      id: `lights-off:${sensor.id}`,
      deviceId: first.id,
      title: `Lights off after no motion in ${sensor.label}`,
      why: 'Waits until the room is quiet for a while, then switches the lights off.',
      name: `Lights off after no motion · ${sensor.label}`,
      category: 'lights',
      devices: [...labelsOf(lights), sensor.label],
      slots: [
        devicesSlot('lights', 'Lights', idsOf(lights), choicesOf(allLights(devices))),
        numberSlot('minutes', 'Quiet for', 5, { min: 1, max: 120, unit: 'min' }),
      ],
      make: (use, m) =>
        automation({
          mode: 'restart',
          triggers: [
            stateSignal(m, 'signal1', {
              subject: sensor.id,
              field: 'motion',
              test: { is: 'eq', to: true },
            }),
          ],
          body: [
            m.node('quiet', 'fn.call', {
              fn: lit('builtin.lights_off_after'),
              lights: lit({ devices: [...use.texts('lights')] }),
              sensor: lit(sensor.id),
              after: lit(use.number('minutes') * MINUTE_MS),
            }),
          ],
        }),
    }),
  ];
}

function handsOffProgram(use: Use, m: Maker): AutomationV3 {
  return automation({
    description:
      'Clears the automatic-on flag whenever a light in the room is changed by hand, so presence lights leave it alone.',
    variables: [
      {
        name: 'autoOn',
        type: { t: 'boolean' },
        initial: lit(false),
        persist: true,
        description: 'True while the lights are on because of presence.',
      },
    ],
    triggers: [
      m.trigger('device1', 'trigger.device', {
        room: lit(use.text('room')),
        family: lit('light'),
        control: lit('power'),
        cause: lit('physical'),
      }),
    ],
    body: [
      m.node('release', 'var.set', {
        source: lit('automation'),
        name: lit('autoOn'),
        to: lit(false),
      }),
    ],
  });
}

export function handsOffTemplates(
  devices: readonly TemplateDevice[],
  rooms: readonly TemplateRoom[],
): Template[] {
  const lit_ = allLights(devices).filter((light) =>
    rooms.some((room) => room.id === light.room_id),
  );
  const first = lit_[0];
  const roomId = first?.room_id;
  if (first === undefined || roomId === undefined || roomId === null) return [];
  const choices = rooms
    .filter((room) => lit_.some((light) => light.room_id === room.id))
    .map((room) => ({ value: room.id, label: room.name }));
  return [
    template({
      id: 'hands-off',
      deviceId: first.id,
      title: 'Hands off after a manual change',
      why: 'When someone switches a light by hand, automatic lights stop touching it.',
      name: 'Hands off after a manual change',
      category: 'lights',
      devices: labelsOf(lit_.filter((light) => light.room_id === roomId)),
      slots: [roomSlot('room', 'Room', roomId, choices)],
      make: handsOffProgram,
    }),
  ];
}
