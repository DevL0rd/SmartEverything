import { isCamera } from '@smarteverything/domain';
import { MINUTE_MS, automation, lit, type Ports } from './build';
import {
  choicesOf,
  devicesSlot,
  numberSlot,
  peopleSlot,
  template,
  timeSlot,
  type Template,
  type TemplateDevice,
  type TemplateRoom,
} from './parameters';
import { allLights, idsOf, isReadable, labelsOf, lightsOf, withCapability } from './picks';

const AMBER = { hue: 35, saturation: 100, value: 100 };

function wakeUpLight(devices: readonly TemplateDevice[]): Template[] {
  const lights = lightsOf(devices);
  const first = lights[0];
  if (first === undefined) return [];
  return [
    template({
      id: 'wake-up-light',
      deviceId: first.id,
      title: 'Wake up with a sunrise',
      why: 'Starts at one percent in warm white and brightens to full over the time you pick.',
      name: 'Wake-up light',
      category: 'lights',
      devices: labelsOf(lights),
      slots: [
        devicesSlot('lights', 'Lights', idsOf(lights), choicesOf(allLights(devices))),
        timeSlot('at', 'Start at', '06:30'),
        numberSlot('minutes', 'Sunrise lasts', 15, { min: 1, max: 60, unit: 'min' }),
      ],
      make: (use, m) =>
        automation({
          triggers: [m.trigger('time1', 'trigger.time', { at: lit(use.text('at')) })],
          body: [
            m.node('sunrise', 'fn.call', {
              fn: lit('builtin.wake_up_light'),
              lights: lit({ devices: [...use.texts('lights')] }),
              over: lit(use.number('minutes') * MINUTE_MS),
            }),
          ],
        }),
    }),
  ];
}

function doorbellFlash(devices: readonly TemplateDevice[]): Template[] {
  const lights = lightsOf(devices);
  const first = lights[0];
  if (first === undefined) return [];
  return devices.filter(isCamera).map((camera) =>
    template({
      id: `doorbell-flash:${camera.id}`,
      deviceId: camera.id,
      title: `Flash the lights when ${camera.label} rings`,
      why: 'You see the doorbell even with the sound off, and the lights go back as they were.',
      name: `Doorbell flash · ${camera.label}`,
      category: 'notifications',
      devices: [camera.label, ...labelsOf(lights)],
      slots: [
        devicesSlot('lights', 'Lights', idsOf(lights), choicesOf(allLights(devices))),
        numberSlot('times', 'Flashes', 3, { min: 1, max: 10 }),
      ],
      make: (use, m) =>
        automation({
          triggers: [
            m.trigger('camera1', 'trigger.camera', {
              camera: lit(camera.id),
              detection: lit('doorbell'),
            }),
          ],
          body: [
            m.node('flash', 'fn.call', {
              fn: lit('builtin.doorbell_flash'),
              lights: lit({ devices: [...use.texts('lights')] }),
              color: lit(AMBER),
              times: lit(use.number('times')),
            }),
          ],
        }),
    }),
  );
}

function leaveHomeCheck(
  devices: readonly TemplateDevice[],
  people: readonly TemplateRoom[],
): Template[] {
  const lights = lightsOf(devices);
  const first = lights[0];
  const openings = withCapability(devices, 'contact', isReadable);
  if (first === undefined || openings.length === 0 || people.length === 0) return [];
  return [
    template({
      id: 'leave-home-check',
      deviceId: first.id,
      title: 'Check the house when the last person leaves',
      why: 'Switches the lights off and tells you which doors and windows were left open.',
      name: 'Leave home check',
      category: 'presence',
      devices: [...labelsOf(lights), ...labelsOf(openings)],
      slots: [
        devicesSlot('lights', 'Lights', idsOf(lights), choicesOf(allLights(devices))),
        devicesSlot('openings', 'Doors and windows', idsOf(openings), choicesOf(openings)),
        peopleSlot(
          'people',
          'Tell',
          people.map((person) => person.id),
          people.map((person) => ({ value: person.id, label: person.name })),
        ),
      ],
      make: (use, m) =>
        automation({
          triggers: [
            m.trigger('presence1', 'trigger.presence', {
              event: lit('left'),
              when: lit('everyone_left'),
            }),
          ],
          body: [
            m.node('check', 'fn.call', {
              fn: lit('builtin.leave_home_check'),
              people: lit([...use.texts('people')]),
              lights: lit({ devices: [...use.texts('lights')] }),
              openings: lit({ devices: [...use.texts('openings')] }),
            }),
          ],
        }),
    }),
  ];
}

interface TriggerNotice {
  readonly id: string;
  readonly title: string;
  readonly why: string;
  readonly name: string;
  readonly message: string;
  readonly kind: string;
  readonly ports: Ports;
}

const TRIGGER_NOTICES: readonly TriggerNotice[] = [
  {
    id: 'hub-started-notice',
    title: 'Tell me when the hub restarts',
    why: 'Adds a line to your feed each time the home hub starts, so you know it came back.',
    name: 'Hub restarted',
    message: 'The home hub started.',
    kind: 'trigger.hub_started',
    ports: {},
  },
  {
    id: 'dusk-notice',
    title: 'Tell me when it gets dark',
    why: 'Adds a line to your feed at dusk, when the evening light is gone.',
    name: 'Dusk',
    message: 'It is getting dark.',
    kind: 'trigger.sun',
    ports: { event: lit('dusk') },
  },
  {
    id: 'golden-hour-notice',
    title: 'Tell me when the golden hour starts',
    why: 'Adds a line to your feed when the evening sun is low and warm.',
    name: 'Golden hour',
    message: 'The golden hour has started.',
    kind: 'trigger.sun',
    ports: { event: lit('golden_hour_evening') },
  },
  {
    id: 'timer-finished-notice',
    title: 'Tell me when the laundry timer ends',
    why: 'Adds a line to your feed when the timer named laundry ends.',
    name: 'Laundry timer',
    message: 'The laundry timer ended.',
    kind: 'trigger.timer',
    ports: { timer: lit('laundry') },
  },
  {
    id: 'guest-mode-notice',
    title: 'Tell me when guest mode is switched on',
    why: 'Adds a line to your feed when an automation sends the event guest_mode_on.',
    name: 'Guest mode',
    message: 'Guest mode is on.',
    kind: 'trigger.event',
    ports: { name: lit('guest_mode_on') },
  },
];

function triggerNotices(): Template[] {
  return TRIGGER_NOTICES.map((entry) =>
    template({
      id: entry.id,
      deviceId: null,
      title: entry.title,
      why: entry.why,
      name: entry.name,
      category: 'notifications',
      devices: [],
      slots: [],
      make: (_use, m) =>
        automation({
          triggers: [m.trigger('start1', entry.kind, entry.ports)],
          body: [m.node('note', 'notify.feed', { message: lit(entry.message) })],
        }),
    }),
  );
}

export function builtinV11Templates(
  devices: readonly TemplateDevice[],
  people: readonly TemplateRoom[] = [],
): Template[] {
  return [
    ...wakeUpLight(devices),
    ...doorbellFlash(devices),
    ...leaveHomeCheck(devices, people),
    ...triggerNotices(),
  ];
}
