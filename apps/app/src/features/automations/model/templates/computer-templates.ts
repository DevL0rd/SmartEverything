import type { ComputerFeature, GraphPiece } from '@smarteverything/domain';
import { lit } from './build';
import { graphAutomation, type GraphMaker } from './graph-kit';
import {
  numberSlot,
  template,
  timeSlot,
  type Slot,
  type Template,
  type TemplateDevice,
  type Use,
} from './parameters';

export type ComputerFeatures = ReadonlyMap<string, readonly ComputerFeature[]>;

interface ComputerIdea {
  readonly key: string;
  readonly feature: ComputerFeature;
  readonly name: (label: string) => string;
  readonly title: (label: string) => string;
  readonly why: string;
  readonly slots: readonly Slot[];
  readonly when: (m: GraphMaker, use: Use) => ReturnType<GraphMaker['trigger']>;
  readonly step: (m: GraphMaker, computer: string, use: Use) => GraphPiece;
}

const IDEAS: readonly ComputerIdea[] = [
  {
    key: 'quiet',
    name: (label) => `${label} bedtime volume`,
    feature: 'audio',
    title: (label) => `Turn ${label} down at bedtime`,
    why: 'Keeps the volume low late at night.',
    slots: [
      timeSlot('at', 'Time', '22:30'),
      numberSlot('level', 'Volume', 25, { min: 0, max: 100, unit: '%' }),
    ],
    when: (m, use) => m.trigger('time1', 'trigger.time', { at: lit(use.text('at')) }),
    step: (m, computer, use) =>
      m.node('volume', 'computer.audio', {
        computer: lit(computer),
        action: lit('volume'),
        kind: lit('output'),
        level: lit(use.number('level')),
      }),
  },
  {
    key: 'dim',
    name: (label) => `${label} night brightness`,
    feature: 'brightness',
    title: (label) => `Dim ${label}’s screens at night`,
    why: 'Easier on the eyes after dark.',
    slots: [
      timeSlot('at', 'Time', '22:00'),
      numberSlot('level', 'Brightness', 30, { min: 0, max: 100, unit: '%' }),
    ],
    when: (m, use) => m.trigger('time1', 'trigger.time', { at: lit(use.text('at')) }),
    step: (m, computer, use) =>
      m.node('brightness', 'computer.display', {
        computer: lit(computer),
        action: lit('brightness'),
        brightness: lit(use.number('level')),
      }),
  },
  {
    key: 'warm',
    name: (label) => `${label} night light`,
    feature: 'night_light',
    title: (label) => `Warm ${label}’s screens at sunset`,
    why: 'Switches night light on when the sun goes down.',
    slots: [numberSlot('kelvin', 'Warmth', 3500, { min: 1200, max: 6500, unit: 'K' })],
    when: (m) => m.trigger('sun1', 'trigger.sun', { event: lit('sunset') }),
    step: (m, computer, use) =>
      m.node('warm', 'computer.display', {
        computer: lit(computer),
        action: lit('night_light'),
        nightLight: lit('on'),
        temperature: lit(use.number('kelvin')),
      }),
  },
];

function offers(
  features: readonly ComputerFeature[] | undefined,
  feature: ComputerFeature,
): boolean {
  return features === undefined || features.includes(feature);
}

export function computerTemplates(
  devices: readonly TemplateDevice[],
  features: ComputerFeatures,
): Template[] {
  return devices
    .filter((device) => device.kind === 'computer')
    .flatMap((computer) =>
      IDEAS.filter((idea) => {
        const known = features.get(computer.id);
        return known !== undefined && offers(known, idea.feature);
      }).map((idea) =>
        template({
          id: `computer-${idea.key}:${computer.id}`,
          deviceId: computer.id,
          title: idea.title(computer.label),
          why: idea.why,
          name: idea.name(computer.label),
          category: 'computers',
          devices: [computer.label],
          slots: idea.slots,
          make: (use, m) =>
            graphAutomation({
              triggers: [idea.when(m, use)],
              body: [idea.step(m, computer.id, use)],
            }),
        }),
      ),
    );
}
