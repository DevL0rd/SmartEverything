import { EVERY_DAY, automation, lit, wire } from './build';
import { eventTemplate, noticeTemplate } from './notice-template';
import { numberSlot, template, timeSlot, type Template, type TemplateDevice } from './parameters';
import { setDevices } from './parts';

const MOSTLY_FULL_PERCENT = 70;
const AFTERNOON = '15:00';
const BEDTIME = '22:00';

function bottleAfternoon(device: TemplateDevice): Template {
  return noticeTemplate({
    id: `bottle-afternoon:${device.id}`,
    device,
    title: `Nudge me to drink from ${device.label}`,
    why: `At ${AFTERNOON} every day, when the bottle is still over ${String(MOSTLY_FULL_PERCENT)} % full.`,
    short: 'Afternoon nudge',
    name: `Afternoon nudge · ${device.label}`,
    category: 'appliances',
    message: `${device.label} is still mostly full. Time for a drink.`,
    slots: [
      timeSlot('at', 'Time', AFTERNOON),
      numberSlot('full', 'Still at least', MOSTLY_FULL_PERCENT, { min: 10, max: 100, unit: '%' }),
    ],
    trigger: (m, use) =>
      m.trigger('time1', 'trigger.time', { at: lit(use.text('at')), days: lit([...EVERY_DAY]) }),
    checks: (m, use) => [
      m.node('level', 'device.get', { device: lit(device.id), control: lit('water_level') }),
      m.node('mostlyFull', 'logic.compare', {
        a: wire('level', 'value'),
        b: lit(use.number('full')),
        op: lit('gte'),
      }),
      m.node('onlyIfFull', 'flow.guard', { condition: wire('mostlyFull', 'result') }),
    ],
  });
}

function bottleBedtime(device: TemplateDevice): Template {
  return template({
    id: `bottle-bedtime:${device.id}`,
    deviceId: device.id,
    title: `Silence the reminders on ${device.label} at bedtime`,
    why: `Turns quiet hours on at ${BEDTIME}; it applies when the bottle next wakes.`,
    short: 'Bedtime quiet',
    name: `Bedtime quiet · ${device.label}`,
    category: 'appliances',
    devices: [device.label],
    slots: [timeSlot('at', 'Time', BEDTIME)],
    make: (use, m) =>
      automation({
        triggers: [
          m.trigger('time1', 'trigger.time', {
            at: lit(use.text('at')),
            days: lit([...EVERY_DAY]),
          }),
        ],
        body: [
          setDevices(m, 'quiet', {
            target: { device: device.id },
            control: 'quiet_hours',
            to: 'on',
          }),
        ],
      }),
  });
}

export function bottleTemplates(device: TemplateDevice): Template[] {
  return [
    bottleAfternoon(device),
    eventTemplate(
      device,
      'bottle-goal',
      { kind: 'activity', match: { activity: 'goal_reached' } },
      {
        title: `Say well done when the water goal is reached`,
        why: 'A notice the moment the day passes the water goal.',
        short: 'Goal reached',
        message: 'You reached your water goal today. Well done.',
      },
    ),
    eventTemplate(
      device,
      'bottle-battery',
      { kind: 'maintenance', match: { maintenance: 'battery_low' } },
      {
        title: `Tell me when ${device.label} runs low on battery`,
        why: 'A notice once per discharge, at the cap alert level.',
        short: 'Battery low',
        message: `The cap on ${device.label} needs charging.`,
      },
    ),
    eventTemplate(
      device,
      'bottle-filter',
      { kind: 'maintenance', match: { maintenance: 'filter_due' } },
      {
        title: `Remind me to change the filter in ${device.label}`,
        why: 'A notice when the filter pod passes its litres or its days.',
        short: 'Filter due',
        message: `The filter in ${device.label} is due.`,
      },
    ),
    eventTemplate(
      device,
      'bottle-fault',
      { kind: 'fault', match: {} },
      {
        title: `Tell me about faults on ${device.label}`,
        why: 'A notice when the cap reports a fault.',
        short: 'Bottle fault',
        message: `${device.label} reported a fault.`,
      },
    ),
    bottleBedtime(device),
  ];
}
