import { pluginSignalSource } from '@smarteverything/domain';
import { noticeTemplate } from './notice-template';
import type { Template, TemplateDevice } from './parameters';
import { eventSignal } from './parts';

interface Spec {
  readonly id: string;
  readonly kind: string;
  readonly extra: Readonly<Record<string, string>>;
  readonly short: string;
  readonly title: (label: string) => string;
  readonly why: string;
  readonly message: (label: string) => string;
}

const SPECS: readonly Spec[] = [
  {
    id: 'printer-low',
    kind: 'supply_low',
    extra: {},
    short: 'Ink is low',
    title: (label) => `Remind me to buy ink for ${label}`,
    why: 'A notice when a cartridge runs low, so a new one goes on the shopping list in time.',
    message: (label) =>
      `A cartridge in ${label} is running low. Put a new one on the shopping list.`,
  },
  {
    id: 'printer-empty',
    kind: 'supply_empty',
    extra: {},
    short: 'Out of ink',
    title: (label) => `Tell me when ${label} runs out of ink`,
    why: 'A notice when a cartridge is empty and printing may stop.',
    message: (label) => `A cartridge in ${label} is empty.`,
  },
  {
    id: 'printer-problem',
    kind: 'problem_added',
    extra: {},
    short: 'Printer problem',
    title: (label) => `Tell me when ${label} needs attention`,
    why: 'A notice when the printer reports a jam, an open cover, empty paper or another problem.',
    message: (label) => `${label} needs attention.`,
  },
  {
    id: 'printer-done',
    kind: 'job_finished',
    extra: { result: 'completed' },
    short: 'Print finished',
    title: (label) => `Tell me when a print on ${label} is done`,
    why: 'A notice the moment a print job finishes.',
    message: (label) => `A print on ${label} is finished.`,
  },
  {
    id: 'printer-offline',
    kind: 'offline_long',
    extra: {},
    short: 'Printer offline',
    title: (label) => `Tell me when ${label} stays offline`,
    why: 'A notice when the printer has not answered for 30 minutes.',
    message: (label) => `${label} has been offline for 30 minutes.`,
  },
];

function templateOf(device: TemplateDevice, spec: Spec): Template {
  return noticeTemplate({
    id: `${spec.id}:${device.id}`,
    device,
    title: spec.title(device.label),
    why: spec.why,
    short: spec.short,
    name: `${spec.short} · ${device.label}`,
    category: 'appliances',
    message: spec.message(device.label),
    trigger: (m) =>
      eventSignal(m, 'signal1', {
        source: pluginSignalSource('printer'),
        kind: spec.kind,
        match: { printer: device.label, ...spec.extra },
      }),
  });
}

export function printerTemplates(device: TemplateDevice): Template[] {
  return SPECS.map((spec) => templateOf(device, spec));
}
