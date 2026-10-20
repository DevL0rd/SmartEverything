import { automation } from './build';
import { eventTemplate, noticeTemplate } from './notice-template';
import {
  choicesOf,
  devicesSlot,
  numberSlot,
  template,
  type Template,
  type TemplateDevice,
} from './parameters';
import { setDevices, stateSignal } from './parts';
import { allLights, idsOf, lightsOf } from './picks';

const LOW_BATTERY_PERCENT = 20;
const DAYS_LEFT = 'brush_head_days_left';

function brushLight(device: TemplateDevice, devices: readonly TemplateDevice[]): Template[] {
  const lights = lightsOf(devices);
  if (lights.length === 0) return [];
  return [
    template({
      id: `brush-light:${device.id}`,
      deviceId: device.id,
      title: `Turn on the light while ${device.label} is brushing`,
      why: 'Switches the lights on as soon as the brush starts; add a step to switch them off again.',
      short: 'Light while brushing',
      name: `Light while brushing · ${device.label}`,
      category: 'lights',
      devices: [device.label],
      slots: [devicesSlot('lights', 'Lights', idsOf(lights), choicesOf(allLights(devices)))],
      make: (use, m) =>
        automation({
          triggers: [
            stateSignal(m, 'signal1', {
              subject: device.id,
              field: 'brush_activity',
              test: { is: 'eq', to: 'brushing' },
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

function brushBattery(device: TemplateDevice): Template {
  return noticeTemplate({
    id: `brush-battery:${device.id}`,
    device,
    title: `Tell me when ${device.label} needs charging`,
    why: `A notice when the battery drops to ${String(LOW_BATTERY_PERCENT)} % or less.`,
    short: 'Battery low',
    name: `Battery low · ${device.label}`,
    category: 'appliances',
    message: `${device.label} needs charging.`,
    slots: [
      numberSlot('level', 'Battery at or below', LOW_BATTERY_PERCENT, {
        min: 5,
        max: 90,
        unit: '%',
      }),
    ],
    trigger: (m, use) =>
      stateSignal(m, 'signal1', {
        subject: device.id,
        field: 'battery',
        test: { is: 'lte', to: use.number('level') },
      }),
  });
}

function brushHeadDue(device: TemplateDevice): Template[] {
  const copy = {
    title: `Remind me to change the brush head on ${device.label}`,
    why: 'A notice when the brush head is worn out.',
    short: 'New brush head',
    message: `The brush head on ${device.label} is worn out. Time for a new one.`,
  };
  if (!device.capabilities.some((capability) => capability.key === DAYS_LEFT)) {
    return [
      eventTemplate(
        device,
        'brush-head-due',
        { kind: 'maintenance', match: { brushHead: 'due' } },
        copy,
      ),
    ];
  }
  return [
    noticeTemplate({
      id: `brush-head-due:${device.id}`,
      device,
      title: copy.title,
      why: 'A notice when no days are left on the brush head.',
      short: copy.short,
      name: `${copy.short} · ${device.label}`,
      category: 'appliances',
      message: copy.message,
      trigger: (m) =>
        stateSignal(m, 'signal1', {
          subject: device.id,
          field: DAYS_LEFT,
          test: { is: 'lte', to: 0 },
        }),
    }),
  ];
}

export function brushTemplates(
  device: TemplateDevice,
  devices: readonly TemplateDevice[],
): Template[] {
  return [...brushLight(device, devices), ...brushHeadDue(device), brushBattery(device)];
}
