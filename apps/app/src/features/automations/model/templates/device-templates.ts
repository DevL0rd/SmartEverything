import { MICROWAVE_KEYS, capabilityOf, presentDevice } from '@smarteverything/domain';
import { EVERY_DAY, automation, lit, wire } from './build';
import { bottleTemplates } from './bottle-templates';
import { brushTemplates } from './brush-templates';
import { eventTemplate, noticeTemplate } from './notice-template';
import { template, timeSlot, type Template, type TemplateDevice } from './parameters';
import { eventSignal, setDevices, stateSignal } from './parts';
import { printerTemplates } from './printer-templates';

const STILL_INSIDE_SECONDS = 600;
const SUNDAY = 0;
const HIGH_INCLINE = 8;
const INCLINE_REARM = 6;
const INCLINE_HOLD_SECONDS = 20;

function microwaves(devices: readonly TemplateDevice[]): TemplateDevice[] {
  return devices.filter(
    (device) =>
      presentDevice(device).family === 'microwave' &&
      capabilityOf(device, MICROWAVE_KEYS.job) !== undefined,
  );
}

function foodReady(device: TemplateDevice): Template {
  return noticeTemplate({
    id: `microwave-ready:${device.id}`,
    device,
    title: `Notice when food is ready in ${device.label}`,
    why: 'A notice the moment the cycle finishes.',
    short: 'Food is ready',
    name: `Food is ready · ${device.label}`,
    category: 'appliances',
    message: `The food in ${device.label} is ready.`,
    trigger: (m) =>
      stateSignal(m, 'signal1', {
        subject: device.id,
        field: MICROWAVE_KEYS.job,
        test: { is: 'eq', to: 'finished' },
      }),
  });
}

function foodStillInside(device: TemplateDevice): Template[] {
  if (capabilityOf(device, MICROWAVE_KEYS.door) === undefined) return [];
  return [
    noticeTemplate({
      id: `microwave-inside:${device.id}`,
      device,
      title: `Notice when food is left in ${device.label}`,
      why: 'Ten minutes after a finished cycle with the door still closed.',
      short: 'Food still inside',
      name: `Food still inside · ${device.label}`,
      category: 'appliances',
      message: `There is still food in ${device.label}.`,
      trigger: (m) =>
        stateSignal(m, 'signal1', {
          subject: device.id,
          field: MICROWAVE_KEYS.job,
          test: { is: 'eq', to: 'finished' },
          holdSeconds: STILL_INSIDE_SECONDS,
        }),
      checks: (m) => [
        m.node('door', 'device.get', {
          device: lit(device.id),
          control: lit(MICROWAVE_KEYS.door),
        }),
        m.node('isClosed', 'logic.compare', {
          a: wire('door', 'value'),
          op: lit('eq'),
          b: lit('closed'),
        }),
        m.node('closed', 'flow.guard', { condition: wire('isClosed', 'result') }),
      ],
    }),
  ];
}

function weighIn(device: TemplateDevice): Template {
  return noticeTemplate({
    id: `weigh-in:${device.id}`,
    device,
    title: `Weekly weigh-in reminder for ${device.label}`,
    why: 'A notice every Sunday morning.',
    short: 'Weekly weigh-in',
    name: `Weekly weigh-in · ${device.label}`,
    category: 'notifications',
    message: `Time for your weekly weigh-in on ${device.label}.`,
    slots: [timeSlot('at', 'Time', '08:00')],
    trigger: (m, use) =>
      m.trigger('time1', 'trigger.time', { at: lit(use.text('at')), days: lit([SUNDAY]) }),
  });
}

function adguardOff(device: TemplateDevice): Template[] {
  if (capabilityOf(device, 'dns_protection') === undefined) return [];
  return [
    noticeTemplate({
      id: `adguard-off:${device.id}`,
      device,
      title: `Tell me if ad blocking turns off on ${device.label}`,
      why: 'A notice when protection is paused or switched off.',
      short: 'Blocking off',
      name: `Ad blocking off · ${device.label}`,
      category: 'notifications',
      message: `Ad blocking on ${device.label} is off.`,
      trigger: (m) =>
        stateSignal(m, 'signal1', {
          subject: device.id,
          field: 'dns_protection',
          test: { is: 'eq', to: false },
        }),
    }),
  ];
}

function syncProblem(device: TemplateDevice): Template[] {
  if (capabilityOf(device, 'sync_state') === undefined) return [];
  return [
    noticeTemplate({
      id: `sync-error:${device.id}`,
      device,
      title: `Tell me about sync problems on ${device.label}`,
      why: 'A notice when syncing reports an error.',
      short: 'Sync problem',
      name: `Sync problem · ${device.label}`,
      category: 'notifications',
      message: `Syncing on ${device.label} ran into an error.`,
      trigger: (m) =>
        stateSignal(m, 'signal1', {
          subject: device.id,
          field: 'sync_state',
          test: { is: 'eq', to: 'error' },
        }),
    }),
  ];
}

function buttonAction(device: TemplateDevice): Template {
  return noticeTemplate({
    id: `button:${device.id}`,
    device,
    title: `Make ${device.label} do something`,
    why: 'Starts from a press of this button; add what should happen.',
    short: 'Press action',
    name: `Press · ${device.label}`,
    category: 'presence',
    message: `${device.label} was pressed.`,
    trigger: (m) =>
      eventSignal(m, 'signal1', {
        source: 'event',
        kind: 'button',
        subject: device.id,
        match: { action: 'single_press' },
      }),
  });
}

function treadmillLock(device: TemplateDevice): Template {
  return template({
    id: `treadmill-lock:${device.id}`,
    deviceId: device.id,
    title: `Lock ${device.label} every night`,
    why: 'Turns the child lock on at 23:00 so the belt cannot be started by accident.',
    short: 'Night lock',
    name: `Night lock · ${device.label}`,
    category: 'appliances',
    devices: [device.label],
    slots: [timeSlot('at', 'Time', '23:00')],
    make: (use, m) =>
      automation({
        triggers: [
          m.trigger('time1', 'trigger.time', {
            at: lit(use.text('at')),
            days: lit([...EVERY_DAY]),
          }),
        ],
        body: [
          setDevices(m, 'lock', { target: { device: device.id }, control: 'child_lock', to: true }),
        ],
      }),
  });
}

function treadmillReminder(device: TemplateDevice): Template {
  return noticeTemplate({
    id: `treadmill-reminder:${device.id}`,
    device,
    title: `Remind me to walk on ${device.label}`,
    why: 'A notice every evening at 18:00; change the time to suit you.',
    short: 'Walk reminder',
    name: `Walk reminder · ${device.label}`,
    category: 'appliances',
    message: `Time for a walk on ${device.label}.`,
    slots: [timeSlot('at', 'Time', '18:00')],
    trigger: (m, use) =>
      m.trigger('time1', 'trigger.time', { at: lit(use.text('at')), days: lit([...EVERY_DAY]) }),
  });
}

function treadmillSteep(device: TemplateDevice): Template[] {
  if (capabilityOf(device, 'belt_incline') === undefined) return [];
  return [
    noticeTemplate({
      id: `treadmill-steep:${device.id}`,
      device,
      title: `Notice when the incline on ${device.label} gets steep`,
      why: `Fires when the belt's incline number stays at ${String(HIGH_INCLINE)} or more for ${String(INCLINE_HOLD_SECONDS)} seconds, and again only after it went below ${String(INCLINE_REARM)}. Change the numbers to suit the belt's scale.`,
      short: 'Steep incline',
      name: `Steep incline · ${device.label}`,
      category: 'appliances',
      message: `The incline on ${device.label} is ${String(HIGH_INCLINE)} or more.`,
      trigger: (m) =>
        stateSignal(m, 'signal1', {
          subject: device.id,
          field: 'belt_incline',
          test: { is: 'gte', to: HIGH_INCLINE },
          holdSeconds: INCLINE_HOLD_SECONDS,
          rearm: INCLINE_REARM,
        }),
    }),
  ];
}

function treadmillScheduled(device: TemplateDevice): Template[] {
  return [...treadmillSteep(device), treadmillLock(device), treadmillReminder(device)];
}

function treadmillTemplates(device: TemplateDevice): Template[] {
  return [
    eventTemplate(
      device,
      'treadmill-finished',
      { kind: 'activity', match: { phase: 'finished' } },
      {
        title: `Notice when a walk ends on ${device.label}`,
        why: 'A notice with the summary the moment the session finishes.',
        short: 'Walk finished',
        message: `The session on ${device.label} is finished.`,
      },
    ),
    eventTemplate(
      device,
      'treadmill-goal',
      { kind: 'activity', match: { phase: 'goal_reached' } },
      {
        title: `Celebrate a reached goal on ${device.label}`,
        why: 'A notice when the session goal set on the belt is reached.',
        short: 'Goal reached',
        message: `Goal reached on ${device.label}.`,
      },
    ),
    eventTemplate(
      device,
      'treadmill-fault',
      { kind: 'fault', match: {} },
      {
        title: `Tell me about faults on ${device.label}`,
        why: 'A notice when the belt reports a fault or the safety key is pulled.',
        short: 'Treadmill fault',
        message: `${device.label} reported a fault.`,
      },
    ),
    eventTemplate(
      device,
      'treadmill-oil',
      { kind: 'maintenance', match: { reason: 'lubrication_due' } },
      {
        title: `Remind me to oil ${device.label}`,
        why: 'A notice when the belt is due for silicone oil.',
        short: 'Oil the belt',
        message: `The belt on ${device.label} is due for oil.`,
      },
    ),
    ...treadmillScheduled(device),
  ];
}

function inFamily(devices: readonly TemplateDevice[], family: string): TemplateDevice[] {
  return devices.filter((device) => presentDevice(device).family === family);
}

export function deviceTemplates(devices: readonly TemplateDevice[]): Template[] {
  return [
    ...microwaves(devices).flatMap((device) => [foodReady(device), ...foodStillInside(device)]),
    ...inFamily(devices, 'scale').map(weighIn),
    ...devices.filter((device) => device.kind === 'dns_filter').flatMap(adguardOff),
    ...devices.filter((device) => device.kind === 'file_sync').flatMap(syncProblem),
    ...inFamily(devices, 'button').map(buttonAction),
    ...inFamily(devices, 'treadmill').flatMap(treadmillTemplates),
    ...inFamily(devices, 'bottle').flatMap(bottleTemplates),
    ...inFamily(devices, 'toothbrush').flatMap((device) => brushTemplates(device, devices)),
    ...inFamily(devices, 'printer').flatMap(printerTemplates),
  ];
}
