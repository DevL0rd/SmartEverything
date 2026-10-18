import { capabilityOf, MICROWAVE_KEYS, presentDevice } from '@smarteverything/domain';
import type { DeviceLike } from './capability-choices';
import type { Draft } from './editor-state';
import type { Template } from './templates';

const STILL_INSIDE_SECONDS = 600;
const SUNDAY = 0;

function microwaves(devices: readonly DeviceLike[]): DeviceLike[] {
  return devices.filter(
    (device) =>
      presentDevice(device).family === 'microwave' &&
      capabilityOf(device, MICROWAVE_KEYS.job) !== undefined,
  );
}

function jobFinished(device: DeviceLike, holdSeconds?: number): Draft['automation']['when'] {
  return [
    {
      on: 'signal',
      source: 'device',
      kind: 'state',
      subject: device.id,
      field: MICROWAVE_KEYS.job,
      test: { is: 'eq', to: 'finished' },
      ...(holdSeconds === undefined ? {} : { holdSeconds }),
    },
  ];
}

function foodReady(device: DeviceLike): Template {
  return {
    id: `microwave-ready:${device.id}`,
    deviceId: device.id,
    title: `Notice when food is ready in ${device.label}`,
    why: 'A notice the moment the cycle finishes.',
    short: 'Food is ready',
    draft: {
      name: `Food is ready · ${device.label}`,
      enabled: true,
      automation: {
        when: jobFinished(device),
        steps: [{ do: 'notify', message: `The food in ${device.label} is ready.` }],
      },
    },
  };
}

function foodStillInside(device: DeviceLike): Template[] {
  if (capabilityOf(device, MICROWAVE_KEYS.door) === undefined) {
    return [];
  }
  return [
    {
      id: `microwave-inside:${device.id}`,
      deviceId: device.id,
      title: `Notice when food is left in ${device.label}`,
      why: 'Ten minutes after a finished cycle with the door still closed.',
      short: 'Food still inside',
      draft: {
        name: `Food still inside · ${device.label}`,
        enabled: true,
        automation: {
          when: jobFinished(device, STILL_INSIDE_SECONDS),
          onlyIf: {
            compare: { device: device.id, control: MICROWAVE_KEYS.door },
            test: { is: 'eq', to: 'closed' },
          },
          steps: [{ do: 'notify', message: `There is still food in ${device.label}.` }],
        },
      },
    },
  ];
}

function weighIn(device: DeviceLike): Template {
  return {
    id: `weigh-in:${device.id}`,
    deviceId: device.id,
    title: `Weekly weigh-in reminder for ${device.label}`,
    why: 'A notice every Sunday morning.',
    short: 'Weekly weigh-in',
    draft: {
      name: `Weekly weigh-in · ${device.label}`,
      enabled: true,
      automation: {
        when: [{ on: 'time', at: '08:00', days: [SUNDAY] }],
        steps: [{ do: 'notify', message: `Time for your weekly weigh-in on ${device.label}.` }],
      },
    },
  };
}

function adguardOff(device: DeviceLike): Template[] {
  if (capabilityOf(device, 'dns_protection') === undefined) {
    return [];
  }
  return [
    {
      id: `adguard-off:${device.id}`,
      deviceId: device.id,
      title: `Tell me if ad blocking turns off on ${device.label}`,
      why: 'A notice when protection is paused or switched off.',
      short: 'Blocking off',
      draft: {
        name: `Ad blocking off · ${device.label}`,
        enabled: true,
        automation: {
          when: [
            {
              on: 'signal',
              source: 'device',
              kind: 'state',
              subject: device.id,
              field: 'dns_protection',
              test: { is: 'eq', to: false },
            },
          ],
          steps: [{ do: 'notify', message: `Ad blocking on ${device.label} is off.` }],
        },
      },
    },
  ];
}

function syncProblem(device: DeviceLike): Template[] {
  if (capabilityOf(device, 'sync_state') === undefined) {
    return [];
  }
  return [
    {
      id: `sync-error:${device.id}`,
      deviceId: device.id,
      title: `Tell me about sync problems on ${device.label}`,
      why: 'A notice when syncing reports an error.',
      short: 'Sync problem',
      draft: {
        name: `Sync problem · ${device.label}`,
        enabled: true,
        automation: {
          when: [
            {
              on: 'signal',
              source: 'device',
              kind: 'state',
              subject: device.id,
              field: 'sync_state',
              test: { is: 'eq', to: 'error' },
            },
          ],
          steps: [{ do: 'notify', message: `Syncing on ${device.label} ran into an error.` }],
        },
      },
    },
  ];
}

function buttonAction(device: DeviceLike): Template {
  return {
    id: `button:${device.id}`,
    deviceId: device.id,
    title: `Make ${device.label} do something`,
    why: 'Starts from a press of this button; add what should happen.',
    short: 'Press action',
    draft: {
      name: `Press · ${device.label}`,
      enabled: true,
      automation: {
        when: [
          {
            on: 'signal',
            source: 'event',
            kind: 'button',
            subject: device.id,
            match: { action: 'single_press' },
          },
        ],
        steps: [{ do: 'notify', message: `${device.label} was pressed.` }],
      },
    },
  };
}

export function deviceTemplates(devices: readonly DeviceLike[]): Template[] {
  return [
    ...microwaves(devices).flatMap((device) => [foodReady(device), ...foodStillInside(device)]),
    ...devices
      .filter((device) => presentDevice(device).family === 'scale')
      .map((device) => weighIn(device)),
    ...devices.filter((device) => device.kind === 'dns_filter').flatMap(adguardOff),
    ...devices.filter((device) => device.kind === 'file_sync').flatMap(syncProblem),
    ...devices
      .filter((device) => presentDevice(device).family === 'button')
      .map((device) => buttonAction(device)),
  ];
}
