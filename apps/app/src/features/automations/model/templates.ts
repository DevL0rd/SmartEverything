import {
  capabilityOf,
  isCamera,
  type DeviceCapability,
  type StepV2,
  type TriggerTestV2,
  type TriggerV2,
} from '@smarteverything/domain';
import { isReadable, isWritable, type DeviceLike } from './capability-choices';
import { computerTemplates, type ComputerFeatures } from './computer-templates';
import { deviceTemplates } from './device-templates';
import type { Draft } from './editor-state';
import { laundryEntries, type LaundryEntry } from './laundry-steps';

export interface Template {
  readonly id: string;
  readonly deviceId: string;
  readonly title: string;
  readonly why: string;
  readonly short?: string;
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

function powerSteps(devices: readonly DeviceLike[], on: boolean): StepV2[] {
  return [
    {
      do: 'set',
      target: { devices: devices.map((device) => device.id) },
      control: 'power',
      to: on,
    },
  ];
}

function draftOf(
  name: string,
  when: TriggerV2[],
  steps: StepV2[],
  onlyIf?: Draft['automation']['onlyIf'],
): Draft {
  return {
    name,
    enabled: true,
    automation: { when, ...(onlyIf === undefined ? {} : { onlyIf }), steps },
  };
}

function stateTrigger(
  device: DeviceLike,
  capability: string,
  test: TriggerTestV2,
  holdSeconds?: number,
): TriggerV2 {
  return {
    on: 'signal',
    source: 'device',
    kind: 'state',
    subject: device.id,
    field: capability,
    test,
    ...(holdSeconds === undefined ? {} : { holdSeconds }),
  };
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
        draft: draftOf(
          `${device.label} bedtime`,
          [{ on: 'time', at: '22:30' }],
          [
            {
              do: 'set',
              target: { device: device.id },
              control: 'purifier_mode',
              to: option,
            },
          ],
        ),
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
      draft: draftOf(
        'Lights on at sunset',
        [{ on: 'sun', event: 'sunset' }],
        powerSteps(lights, true),
      ),
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
    draft: draftOf(
      `${words.title} · ${sensor.label}`,
      [stateTrigger(sensor, key, { is: 'eq', to: true })],
      [{ do: 'notify', message: `${sensor.label} detected ${words.noun}.` }],
    ),
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
      draft: draftOf(
        `Night light · ${sensor.label}`,
        [stateTrigger(sensor, key, { is: 'eq', to: true })],
        powerSteps([first], true),
        { time: { after: '22:00', before: '06:00' } },
      ),
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
      draft: draftOf(
        `Air boost · ${purifier.label}`,
        [stateTrigger(sensor, 'pm25', { is: 'gt', to: 35 })],
        powerSteps([purifier], true),
      ),
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
      draft: draftOf(
        `Dry air · ${device.label}`,
        [stateTrigger(device, 'humidity', { is: 'lt', to: 40 })],
        powerSteps([device], true),
      ),
    }));
}

function personSeen(devices: readonly DeviceLike[]): Template[] {
  return devices.filter(isCamera).map((camera) => ({
    id: `person:${camera.id}`,
    deviceId: camera.id,
    title: `Notice when ${camera.label} sees a person`,
    why: 'A notice on your phone right away.',
    draft: draftOf(
      `Person seen · ${camera.label}`,
      [{ on: 'signal', source: 'event', kind: 'person', subject: camera.id }],
      [{ do: 'notify', message: `${camera.label} saw a person.` }],
    ),
  }));
}

interface LevelWatch {
  readonly role: 'detergent_level' | 'softener_level' | 'filter_clean';
  readonly low: string | boolean;
  readonly title: string;
  readonly short: string;
  readonly message: string;
}

const LEVEL_WATCHES: readonly LevelWatch[] = [
  {
    role: 'detergent_level',
    low: 'Low',
    title: 'Notice when detergent runs low',
    short: 'Detergent low',
    message: 'is low on detergent.',
  },
  {
    role: 'softener_level',
    low: 'Low',
    title: 'Notice when softener runs low',
    short: 'Softener low',
    message: 'is low on softener.',
  },
  {
    role: 'filter_clean',
    low: true,
    title: 'Notice when the filter needs cleaning',
    short: 'Filter needs cleaning',
    message: 'needs its filter cleaned.',
  },
];

function laundryDone(device: DeviceLike): Template {
  return {
    id: `laundry-done:${device.id}`,
    deviceId: device.id,
    title: `Notice when ${device.label} finishes`,
    why: 'A notice on your phone when the cycle ends.',
    short: 'Finished',
    draft: draftOf(
      `Laundry done · ${device.label}`,
      [
        {
          on: 'signal',
          source: 'event',
          kind: 'cycle_finished',
          subject: device.id,
          match: { outcome: 'completed' },
        },
      ],
      [{ do: 'notify', message: `${device.label} has finished its cycle.` }],
    ),
  };
}

function laundryFault(device: DeviceLike): Template {
  return {
    id: `laundry-fault:${device.id}`,
    deviceId: device.id,
    title: `Notice when ${device.label} has a fault`,
    why: 'Open the machine for the fault and what to try.',
    short: 'Fault',
    draft: draftOf(
      `Fault · ${device.label}`,
      [{ on: 'signal', source: 'event', kind: 'fault', subject: device.id }],
      [{ do: 'notify', message: `${device.label} reported a fault. Open it to see what to try.` }],
    ),
  };
}

function laundryLevels({ device, keys }: LaundryEntry): Template[] {
  return LEVEL_WATCHES.flatMap((watch) => {
    const key = keys.get(watch.role);
    if (key === undefined) {
      return [];
    }
    return [
      {
        id: `laundry-${watch.role}:${device.id}`,
        deviceId: device.id,
        title: `${watch.title} in ${device.label}`,
        why: 'A notice as soon as the machine reports it.',
        short: watch.short,
        draft: draftOf(
          `${watch.title} · ${device.label}`,
          [stateTrigger(device, key, { is: 'eq', to: watch.low })],
          [{ do: 'notify', message: `${device.label} ${watch.message}` }],
        ),
      },
    ];
  });
}

function laundryTemplates(devices: readonly DeviceLike[]): Template[] {
  return [
    ...laundryEntries(devices, ['laundry_status']).map(({ device }) => laundryDone(device)),
    ...laundryEntries(devices, ['fault']).map(({ device }) => laundryFault(device)),
    ...laundryEntries(devices, []).flatMap(laundryLevels),
  ];
}

export function templatesFor(
  devices: readonly DeviceLike[],
  computerFeatures: ComputerFeatures = new Map(),
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
    ...laundryTemplates(devices),
    ...deviceTemplates(devices),
    ...computerTemplates(devices, computerFeatures),
  ];
}

export function unusedTemplates(
  templates: readonly Template[],
  takenNames: readonly string[],
): Template[] {
  const taken = new Set(takenNames.map((name) => name.toLowerCase()));
  return templates.filter((template) => !taken.has(template.draft.name.toLowerCase()));
}
