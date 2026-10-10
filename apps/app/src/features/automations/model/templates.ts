import {
  capabilityOf,
  isCamera,
  type Action,
  type DeviceCapability,
} from '@smarteverything/domain';
import { isReadable, isWritable, type DeviceLike } from './capability-choices';
import { EMPTY_DRAFT, type Draft } from './editor-state';
import { EVERY_DAY } from './blanks';

export interface Template {
  readonly id: string;
  readonly deviceId: string;
  readonly title: string;
  readonly why: string;
  readonly draft: Draft;
}

const MOST_LIGHTS = 6;

function withCapability(
  devices: readonly DeviceLike[],
  key: 'power' | 'purifier_mode' | 'leak' | 'smoke' | 'motion' | 'contact' | 'pm25' | 'humidity',
  usable: (capability: DeviceCapability) => boolean,
): DeviceLike[] {
  return devices.filter((device) => {
    const capability = capabilityOf(device, key);
    return capability !== undefined && usable(capability);
  });
}

function lightsOf(devices: readonly DeviceLike[]): DeviceLike[] {
  return withCapability(devices, 'power', isWritable)
    .filter((device) => device.kind === 'light')
    .slice(0, MOST_LIGHTS);
}

function powerActions(devices: readonly DeviceLike[], on: boolean): Action[] {
  return devices.map((device) => ({
    type: 'command',
    deviceId: device.id,
    capability: 'power',
    value: on,
  }));
}

function sleepOption(device: DeviceLike): string | null {
  const mode = capabilityOf(device, 'purifier_mode');
  if (mode?.value.kind !== 'enum' || !isWritable(mode)) {
    return null;
  }
  return mode.value.options.find((option) => /sleep|night|silent/i.test(option)) ?? null;
}

function purifierAtBedtime(devices: readonly DeviceLike[]): Template[] {
  return devices.flatMap((device) => {
    const option = sleepOption(device);
    if (option === null) {
      return [];
    }
    return [
      {
        id: `bedtime:${device.id}`,
        deviceId: device.id,
        title: `${device.label} to ${option} at bedtime`,
        why: 'Quiet filtering through the night.',
        draft: {
          ...EMPTY_DRAFT,
          name: `${device.label} bedtime`,
          triggers: [{ type: 'time', at: '22:30', weekdays: [...EVERY_DAY] }],
          actions: [
            { type: 'command', deviceId: device.id, capability: 'purifier_mode', value: option },
          ],
        },
      },
    ];
  });
}

function lightsAtSunset(devices: readonly DeviceLike[]): Template[] {
  const lights = lightsOf(devices);
  const first = lights[0];
  if (first === undefined) {
    return [];
  }
  return [
    {
      id: 'sunset-lights',
      deviceId: first.id,
      title: 'Lights on at sunset',
      why: `${lights.map((light) => light.label).join(', ')} as it gets dark.`,
      draft: {
        ...EMPTY_DRAFT,
        name: 'Lights on at sunset',
        triggers: [{ type: 'sun', event: 'sunset', offsetMinutes: 0 }],
        actions: powerActions(lights, true),
      },
    },
  ];
}

function alarmTemplates(
  devices: readonly DeviceLike[],
  key: 'leak' | 'smoke',
  words: { readonly title: string; readonly noun: string },
): Template[] {
  return withCapability(devices, key, isReadable).map((sensor) => ({
    id: `${key}:${sensor.id}`,
    deviceId: sensor.id,
    title: `${words.title} from ${sensor.label}`,
    why: `A notice the moment it detects ${words.noun}.`,
    draft: {
      ...EMPTY_DRAFT,
      name: `${words.title} · ${sensor.label}`,
      triggers: [
        {
          type: 'state',
          deviceId: sensor.id,
          capability: key,
          comparison: { operator: 'eq', value: true },
        },
      ],
      actions: [{ type: 'notify', message: `${sensor.label} detected ${words.noun}.` }],
    },
  }));
}

function nightLight(devices: readonly DeviceLike[]): Template[] {
  const lights = lightsOf(devices);
  const first = lights[0];
  const sensor =
    withCapability(devices, 'motion', isReadable)[0] ??
    withCapability(devices, 'contact', isReadable)[0];
  if (first === undefined || sensor === undefined) {
    return [];
  }
  const key = capabilityOf(sensor, 'motion') === undefined ? 'contact' : 'motion';
  return [
    {
      id: `night:${sensor.id}`,
      deviceId: first.id,
      title: `${first.label} on when ${sensor.label} ${key === 'motion' ? 'sees motion' : 'opens'} at night`,
      why: 'Only between 22:00 and 06:00.',
      draft: {
        ...EMPTY_DRAFT,
        name: `Night light · ${sensor.label}`,
        triggers: [
          {
            type: 'state',
            deviceId: sensor.id,
            capability: key,
            comparison: { operator: 'eq', value: true },
          },
        ],
        conditions: [{ type: 'time_window', after: '22:00', before: '06:00' }],
        actions: powerActions([first], true),
      },
    },
  ];
}

function airBoost(devices: readonly DeviceLike[]): Template[] {
  const sensor = withCapability(devices, 'pm25', isReadable)[0];
  const purifier = withCapability(devices, 'power', isWritable).find(
    (device) => device.kind === 'air_purifier',
  );
  if (sensor === undefined || purifier === undefined) {
    return [];
  }
  return [
    {
      id: `air:${sensor.id}`,
      deviceId: purifier.id,
      title: `${purifier.label} on when PM2.5 rises above 35`,
      why: 'Starts on its own when the air gets worse.',
      draft: {
        ...EMPTY_DRAFT,
        name: `Air boost · ${purifier.label}`,
        triggers: [
          {
            type: 'state',
            deviceId: sensor.id,
            capability: 'pm25',
            comparison: { operator: 'gt', value: 35 },
          },
        ],
        actions: powerActions([purifier], true),
      },
    },
  ];
}

function humidifierWhenDry(devices: readonly DeviceLike[]): Template[] {
  return withCapability(devices, 'humidity', isReadable)
    .filter(
      (device) =>
        device.kind === 'humidifier' && withCapability([device], 'power', isWritable).length > 0,
    )
    .map((device) => ({
      id: `dry:${device.id}`,
      deviceId: device.id,
      title: `${device.label} on when humidity drops below 40%`,
      why: 'Keeps the air from getting too dry.',
      draft: {
        ...EMPTY_DRAFT,
        name: `Dry air · ${device.label}`,
        triggers: [
          {
            type: 'state',
            deviceId: device.id,
            capability: 'humidity',
            comparison: { operator: 'lt', value: 40 },
          },
        ],
        actions: powerActions([device], true),
      },
    }));
}

function personSeen(devices: readonly DeviceLike[]): Template[] {
  return devices.filter(isCamera).map((camera) => ({
    id: `person:${camera.id}`,
    deviceId: camera.id,
    title: `Notice when ${camera.label} sees a person`,
    why: 'A notice on your phone right away.',
    draft: {
      ...EMPTY_DRAFT,
      name: `Person seen · ${camera.label}`,
      triggers: [{ type: 'event', deviceId: camera.id, kind: 'person' }],
      actions: [{ type: 'notify', message: `${camera.label} saw a person.` }],
    },
  }));
}

export function templatesFor(devices: readonly DeviceLike[]): Template[] {
  return [
    ...purifierAtBedtime(devices),
    ...airBoost(devices),
    ...humidifierWhenDry(devices),
    ...personSeen(devices),
    ...lightsAtSunset(devices),
    ...alarmTemplates(devices, 'leak', { title: 'Notify on leak', noun: 'a water leak' }),
    ...alarmTemplates(devices, 'smoke', { title: 'Notify on smoke', noun: 'smoke' }),
    ...nightLight(devices),
  ];
}

export function unusedTemplates(
  templates: readonly Template[],
  takenNames: readonly string[],
): Template[] {
  const taken = new Set(takenNames.map((name) => name.toLowerCase()));
  return templates.filter((template) => !taken.has(template.draft.name.toLowerCase()));
}
