import type { FlowNode, TriggerNode } from '@smarteverything/domain';
import { automation, type Maker } from './build';
import {
  messageSlot,
  template,
  type Category,
  type Slot,
  type Template,
  type TemplateDevice,
  type Use,
} from './parameters';
import { eventSignal, notice } from './parts';

export interface NoticeSpec {
  readonly id: string;
  readonly device: TemplateDevice;
  readonly title: string;
  readonly why: string;
  readonly short?: string;
  readonly name: string;
  readonly category: Category;
  readonly message: string;
  readonly slots?: readonly Slot[];
  readonly trigger: (m: Maker, use: Use) => TriggerNode;
  readonly checks?: (m: Maker, use: Use) => readonly FlowNode[];
}

export function noticeTemplate(spec: NoticeSpec): Template {
  const { device } = spec;
  return template({
    id: spec.id,
    deviceId: device.id,
    title: spec.title,
    why: spec.why,
    ...(spec.short === undefined ? {} : { short: spec.short }),
    name: spec.name,
    category: spec.category,
    devices: [device.label],
    slots: [...(spec.slots ?? []), messageSlot(spec.message)],
    make: (use, m) =>
      automation({
        triggers: [spec.trigger(m, use)],
        body: [...(spec.checks?.(m, use) ?? []), notice(m, 'note', use.text('message'))],
      }),
  });
}

export function eventTemplate(
  device: TemplateDevice,
  id: string,
  event: {
    readonly kind: 'activity' | 'fault' | 'maintenance';
    readonly match: Record<string, string>;
  },
  text: {
    readonly title: string;
    readonly why: string;
    readonly short: string;
    readonly message: string;
  },
): Template {
  return noticeTemplate({
    id: `${id}:${device.id}`,
    device,
    title: text.title,
    why: text.why,
    short: text.short,
    name: `${text.short} · ${device.label}`,
    category: 'appliances',
    message: text.message,
    trigger: (m) =>
      eventSignal(m, 'signal1', {
        source: 'event',
        kind: event.kind,
        subject: device.id,
        match: event.match,
      }),
  });
}
