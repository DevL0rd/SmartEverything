import { MINUTE_MS, automation, lit, wire, type Maker } from './build';
import {
  choicesOf,
  devicesSlot,
  numberSlot,
  template,
  timeSlot,
  type Slot,
  type Template,
  type TemplateDevice,
  type Use,
} from './parameters';
import { notice, setDevices, stateSignal } from './parts';
import { allLights, idsOf, isReadable, lightsOf, withCapability } from './picks';

function clockTrigger(m: Maker, use: Use): ReturnType<Maker['trigger']> {
  return m.trigger('time1', 'trigger.time', { at: lit(use.text('at')) });
}

function forEachLight(): Template {
  return template({
    id: 'learn:for-each-light',
    deviceId: null,
    title: 'Go through every light',
    why: 'For each goes through a list and runs the same steps for every item.',
    name: 'Learn · Every light',
    category: 'learn',
    devices: [],
    slots: [timeSlot('at', 'Time', '23:00')],
    make: (use, m) =>
      automation({
        triggers: [clockTrigger(m, use)],
        body: [
          m.node('lights', 'device.query', { families: lit(['light']) }),
          m.node(
            'each',
            'flow.for_each',
            { items: wire('lights', 'devices') },
            {
              scopes: {
                body: {
                  nodes: [
                    m.node('line', 'text.format', {
                      template: lit('{a} is a light.'),
                      a: wire('each', 'item'),
                    }),
                    m.node('name', 'notify.feed', { message: wire('line', 'text') }),
                  ],
                },
              },
            },
          ),
        ],
      }),
  });
}

function whileLimit(door: TemplateDevice): Template {
  return template({
    id: `learn:while-limit:${door.id}`,
    deviceId: door.id,
    title: `Keep reminding while ${door.label} is open`,
    why: 'While repeats as long as a condition holds, and its limit makes sure it always ends.',
    name: `Learn · Door left open · ${door.label}`,
    category: 'learn',
    devices: [door.label],
    slots: [
      numberSlot('minutes', 'Remind every', 1, { min: 1, max: 30, unit: 'min' }),
      numberSlot('times', 'At most', 5, { min: 1, max: 20, unit: 'times' }),
    ],
    make: (use, m) =>
      automation({
        triggers: [
          stateSignal(m, 'signal1', {
            subject: door.id,
            field: 'contact',
            test: { is: 'eq', to: true },
          }),
        ],
        body: [
          m.node('door', 'device.get', { device: lit(door.id), control: lit('contact') }),
          m.node('isOpen', 'logic.compare', {
            a: wire('door', 'value'),
            op: lit('eq'),
            b: lit(true),
          }),
          m.node(
            'open',
            'flow.while',
            {
              condition: wire('isOpen', 'result'),
              gap: lit(use.number('minutes') * MINUTE_MS),
              limit: lit({ iterations: use.number('times'), onLimit: 'end' }),
            },
            { scopes: { body: { nodes: [notice(m, 'remind', `${door.label} is still open.`)] } } },
          ),
        ],
      }),
  });
}

const LIGHTS_SLOT = (devices: readonly TemplateDevice[]): Slot =>
  devicesSlot('lights', 'Lights', idsOf(lightsOf(devices)), choicesOf(allLights(devices)));

function tryFallback(devices: readonly TemplateDevice[], first: TemplateDevice): Template {
  return template({
    id: 'learn:try-fallback',
    deviceId: first.id,
    title: 'Switch the lights on, or tell me if that fails',
    why: 'Try runs steps and lets a catch row handle a failure instead of ending the run.',
    name: 'Learn · Try with a fallback',
    category: 'learn',
    devices: [first.label],
    slots: [timeSlot('at', 'Time', '07:00'), LIGHTS_SLOT(devices)],
    make: (use, m) =>
      automation({
        triggers: [clockTrigger(m, use)],
        body: [
          m.attempt(
            'attempt',
            [
              setDevices(m, 'on', {
                target: { devices: [...use.texts('lights')] },
                control: 'power',
                to: true,
              }),
            ],
            ['Unreachable'],
            [notice(m, 'unreachable', 'Some lights could not be reached.')],
          ),
        ],
      }),
  });
}

function doTogether(devices: readonly TemplateDevice[], first: TemplateDevice): Template {
  return template({
    id: 'learn:do-together',
    deviceId: first.id,
    title: 'Switch the lights on and write a note at the same time',
    why: 'Do together runs its branches side by side and continues when they are all done.',
    name: 'Learn · Do together',
    category: 'learn',
    devices: [first.label],
    slots: [timeSlot('at', 'Time', '07:00'), LIGHTS_SLOT(devices)],
    make: (use, m) =>
      automation({
        triggers: [clockTrigger(m, use)],
        body: [
          m.node('together', 'flow.parallel', undefined, {
            scopes: {
              lights: {
                nodes: [
                  setDevices(m, 'on', {
                    target: { devices: [...use.texts('lights')] },
                    control: 'power',
                    to: true,
                  }),
                ],
              },
              note: { nodes: [notice(m, 'morning', 'Good morning, the lights are on.')] },
            },
          }),
        ],
      }),
  });
}

function reusableNode(devices: readonly TemplateDevice[], first: TemplateDevice): Template {
  return template({
    id: 'learn:reusable-node',
    deviceId: first.id,
    title: 'Use a Custom Node to switch lights off',
    why: 'A Custom Node packs steps into one block you can use in any automation.',
    name: 'Learn · Make a Custom Node',
    category: 'learn',
    devices: [first.label],
    slots: [timeSlot('at', 'Time', '23:30'), LIGHTS_SLOT(devices)],
    make: (use, m) =>
      automation({
        triggers: [clockTrigger(m, use)],
        body: [
          m.node('switch', 'fn.call', {
            fn: lit('builtin.timed_devices'),
            devices: lit({ devices: [...use.texts('lights')] }),
            on: lit(false),
          }),
        ],
      }),
  });
}

export function learnTemplates(devices: readonly TemplateDevice[]): Template[] {
  const first = lightsOf(devices)[0];
  const doors = withCapability(devices, 'contact', isReadable).slice(0, 1);
  return [
    forEachLight(),
    ...doors.map(whileLimit),
    ...(first === undefined
      ? []
      : [tryFallback(devices, first), doTogether(devices, first), reusableNode(devices, first)]),
  ];
}
