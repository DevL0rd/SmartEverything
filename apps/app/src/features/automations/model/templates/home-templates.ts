import { capabilityOf, isCamera } from '@smarteverything/domain';
import { MINUTE_MS, automation, lit, wire } from './build';
import {
  choicesOf,
  deviceSlot,
  devicesSlot,
  messageSlot,
  numberSlot,
  template,
  timeSlot,
  type Template,
  type TemplateDevice,
  type TemplateRoom,
} from './parameters';
import { handsOffTemplates, lightsOffAfterMotion } from './hands-off-templates';
import { noticeTemplate } from './notice-template';
import { notice, setDevices, stateSignal } from './parts';
import {
  allLights,
  idsOf,
  isReadable,
  isWritable,
  labelsOf,
  lightsOf,
  withCapability,
} from './picks';

function sleepOption(device: TemplateDevice): string | null {
  const mode = capabilityOf(device, 'purifier_mode');
  if (mode?.value.kind !== 'enum' || !isWritable(mode)) return null;
  return mode.value.options.find((option) => /sleep|night|silent/i.test(option)) ?? null;
}

function purifierAtBedtime(devices: readonly TemplateDevice[]): Template[] {
  return devices.flatMap((device) => {
    const option = sleepOption(device);
    if (option === null) return [];
    return [
      template({
        id: `bedtime:${device.id}`,
        deviceId: device.id,
        title: `${device.label} to ${option} at bedtime`,
        why: 'Quiet filtering through the night.',
        name: `${device.label} bedtime`,
        category: 'comfort',
        devices: [device.label],
        slots: [timeSlot('at', 'Time', '22:30')],
        make: (use, m) =>
          automation({
            triggers: [m.trigger('time1', 'trigger.time', { at: lit(use.text('at')) })],
            body: [
              setDevices(m, 'mode', {
                target: { device: device.id },
                control: 'purifier_mode',
                to: option,
              }),
            ],
          }),
      }),
    ];
  });
}

function personSeen(devices: readonly TemplateDevice[]): Template[] {
  return devices.filter(isCamera).map((camera) =>
    noticeTemplate({
      id: `person:${camera.id}`,
      device: camera,
      title: `Notice when ${camera.label} sees a person`,
      why: 'A notice on your phone right away.',
      name: `Person seen · ${camera.label}`,
      category: 'safety',
      message: `${camera.label} saw a person.`,
      trigger: (m) =>
        m.trigger('camera1', 'trigger.camera', {
          camera: lit(camera.id),
          detection: lit('person'),
        }),
    }),
  );
}

function lightsAtSunset(devices: readonly TemplateDevice[]): Template[] {
  const lights = lightsOf(devices);
  const first = lights[0];
  if (first === undefined) return [];
  return [
    template({
      id: 'sunset-lights',
      deviceId: first.id,
      title: 'Lights on at sunset',
      why: `${labelsOf(lights).join(', ')} as it gets dark.`,
      name: 'Lights on at sunset',
      category: 'lights',
      devices: labelsOf(lights),
      slots: [
        devicesSlot('lights', 'Lights', idsOf(lights), choicesOf(allLights(devices))),
        numberSlot('offset', 'Minutes after sunset', 0, { min: -120, max: 120, unit: 'min' }),
      ],
      make: (use, m) =>
        automation({
          triggers: [
            m.trigger('sun1', 'trigger.sun', {
              event: lit('sunset'),
              offset: lit(use.number('offset') * MINUTE_MS),
            }),
          ],
          body: [
            setDevices(m, 'lamps', {
              target: { devices: [...use.texts('lights')] },
              control: 'power',
              to: true,
            }),
          ],
        }),
    }),
  ];
}

function alarmTemplates(
  devices: readonly TemplateDevice[],
  key: 'leak' | 'smoke',
  words: { readonly title: string; readonly noun: string },
): Template[] {
  return withCapability(devices, key, isReadable).map((sensor) =>
    template({
      id: `${key}:${sensor.id}`,
      deviceId: sensor.id,
      title: `${words.title} from ${sensor.label}`,
      why: `A notice the moment it detects ${words.noun}.`,
      name: `${words.title} · ${sensor.label}`,
      category: 'safety',
      devices: [sensor.label],
      slots: [messageSlot(`${sensor.label} detected ${words.noun}.`)],
      make: (use, m) =>
        automation({
          triggers: [
            stateSignal(m, 'signal1', {
              subject: sensor.id,
              field: key,
              test: { is: 'eq', to: true },
            }),
          ],
          body: [notice(m, 'note', use.text('message'))],
        }),
    }),
  );
}

function nightLight(devices: readonly TemplateDevice[]): Template[] {
  const lights = allLights(devices);
  const first = lightsOf(devices)[0];
  const sensor =
    withCapability(devices, 'motion', isReadable)[0] ??
    withCapability(devices, 'contact', isReadable)[0];
  if (first === undefined || sensor === undefined) return [];
  const key = capabilityOf(sensor, 'motion') === undefined ? 'contact' : 'motion';
  return [
    template({
      id: `night:${sensor.id}`,
      deviceId: first.id,
      title: `${first.label} on when ${sensor.label} ${key === 'motion' ? 'sees motion' : 'opens'} at night`,
      why: 'Only between 22:00 and 06:00.',
      name: `Night light · ${sensor.label}`,
      category: 'lights',
      devices: [first.label, sensor.label],
      slots: [
        deviceSlot('light', 'Light', first.id, choicesOf(lights)),
        timeSlot('after', 'From', '22:00'),
        timeSlot('before', 'Until', '06:00'),
      ],
      make: (use, m) =>
        automation({
          triggers: [
            stateSignal(m, 'signal1', {
              subject: sensor.id,
              field: key,
              test: { is: 'eq', to: true },
            }),
          ],
          body: [
            m.node('window', 'logic.time_window', {
              after: lit(use.text('after')),
              before: lit(use.text('before')),
            }),
            m.node('inside', 'flow.guard', { condition: wire('window', 'result') }),
            setDevices(m, 'lamp', {
              target: { device: use.text('light') },
              control: 'power',
              to: true,
            }),
          ],
        }),
    }),
  ];
}

const AIR_HIGH = 35;
const AIR_LOW = 15;

function airBoost(devices: readonly TemplateDevice[]): Template[] {
  const sensor = withCapability(devices, 'pm25', isReadable)[0];
  const purifiers = withCapability(devices, 'power', isWritable).filter(
    (device) => device.kind === 'air_purifier',
  );
  const purifier = purifiers[0];
  if (sensor === undefined || purifier === undefined) return [];
  return [
    template({
      id: `air:${sensor.id}`,
      deviceId: purifier.id,
      title: `${purifier.label} on when PM2.5 rises above ${String(AIR_HIGH)}`,
      why: 'Starts when the air gets worse and stops again once it is clean.',
      name: `Air boost · ${purifier.label}`,
      category: 'comfort',
      devices: [purifier.label, sensor.label],
      slots: [
        deviceSlot('purifier', 'Purifier', purifier.id, choicesOf(purifiers)),
        numberSlot('high', 'Start above', AIR_HIGH, { min: 5, max: 500, unit: 'µg/m³' }),
        numberSlot('low', 'Stop below', AIR_LOW, { min: 1, max: 400, unit: 'µg/m³' }),
      ],
      make: (use, m) => {
        const target = { device: use.text('purifier') };
        return automation({
          triggers: [
            stateSignal(m, 'signal1', {
              subject: sensor.id,
              field: 'pm25',
              test: { is: 'changed' },
            }),
          ],
          body: [
            m.node('band', 'timing.hysteresis', {
              value: wire('signal1', 'value'),
              high: lit(use.number('high')),
              low: lit(use.number('low')),
            }),
            m.when('worse', wire('band', 'rose'), [
              setDevices(m, 'on', { target, control: 'power', to: true }),
            ]),
            m.when('better', wire('band', 'fell'), [
              setDevices(m, 'off', { target, control: 'power', to: false }),
            ]),
          ],
        });
      },
    }),
  ];
}

function humidifierWhenDry(devices: readonly TemplateDevice[]): Template[] {
  return withCapability(devices, 'humidity', isReadable)
    .filter(
      (device) =>
        device.kind === 'humidifier' && withCapability([device], 'power', isWritable).length > 0,
    )
    .map((device) =>
      template({
        id: `dry:${device.id}`,
        deviceId: device.id,
        title: `${device.label} on when humidity drops below 40%`,
        why: 'Keeps the air from getting too dry.',
        name: `Dry air · ${device.label}`,
        category: 'comfort',
        devices: [device.label],
        slots: [numberSlot('below', 'Humidity below', 40, { min: 10, max: 80, unit: '%' })],
        make: (use, m) =>
          automation({
            triggers: [
              stateSignal(m, 'signal1', {
                subject: device.id,
                field: 'humidity',
                test: { is: 'lt', to: use.number('below') },
              }),
            ],
            body: [
              setDevices(m, 'on', { target: { device: device.id }, control: 'power', to: true }),
            ],
          }),
      }),
    );
}

export function homeTemplates(
  devices: readonly TemplateDevice[],
  rooms: readonly TemplateRoom[],
): Template[] {
  return [
    ...purifierAtBedtime(devices),
    ...airBoost(devices),
    ...humidifierWhenDry(devices),
    ...personSeen(devices),
    ...lightsAtSunset(devices),
    ...alarmTemplates(devices, 'leak', { title: 'Notify on leak', noun: 'a water leak' }),
    ...alarmTemplates(devices, 'smoke', { title: 'Notify on smoke', noun: 'smoke' }),
    ...nightLight(devices),
    ...lightsOffAfterMotion(devices),
    ...handsOffTemplates(devices, rooms),
  ];
}
