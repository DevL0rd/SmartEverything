import { automation, lit } from './build';
import { noticeTemplate } from './notice-template';
import { messageSlot, template, textSlot, type Template, type TemplateDevice } from './parameters';
import { notice } from './parts';

function appOpened(devices: readonly TemplateDevice[]): Template[] {
  return devices
    .filter((device) => device.kind === 'computer')
    .map((computer) =>
      noticeTemplate({
        id: `app-opened:${computer.id}`,
        device: computer,
        title: `Notice when an app opens on ${computer.label}`,
        why: 'A notice on your phone when a game or app starts.',
        short: 'App opened',
        name: `App opened · ${computer.label}`,
        category: 'computers',
        message: `An app opened on ${computer.label}.`,
        slots: [textSlot('app', 'App', 'Steam')],
        trigger: (m, use) =>
          m.trigger('computer1', 'trigger.computer', {
            computer: lit(computer.id),
            kind: lit('app_open'),
            app: lit(use.text('app')),
          }),
      }),
    );
}

function sleepEnded(): Template {
  return template({
    id: 'sleep-ended',
    deviceId: null,
    title: 'Say good morning when sleep ends',
    why: 'Starts as soon as your phone records that you woke up.',
    short: 'Sleep ended',
    name: 'Good morning · sleep ended',
    category: 'notifications',
    devices: [],
    slots: [messageSlot('Good morning.')],
    make: (use, m) =>
      automation({
        triggers: [m.trigger('health1', 'trigger.health', { kind: lit('sleep_ended') })],
        body: [notice(m, 'note', use.text('message'))],
      }),
  });
}

function replyFailed(): Template {
  return template({
    id: 'reply-failed',
    deviceId: null,
    title: 'Notice when the AI fails a reply',
    why: 'Tells you when an answer did not come through.',
    short: 'Reply failed',
    name: 'AI reply failed',
    category: 'notifications',
    devices: [],
    slots: [messageSlot('The AI could not finish a reply.')],
    make: (use, m) =>
      automation({
        triggers: [m.trigger('chat1', 'trigger.chat', { outcome: lit('failed') })],
        body: [notice(m, 'note', use.text('message'))],
      }),
  });
}

export function signalTemplates(devices: readonly TemplateDevice[]): Template[] {
  return [...appOpened(devices), sleepEnded(), replyFailed()];
}
