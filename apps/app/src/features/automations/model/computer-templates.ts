import type { ComputerFeature, StepV2, TriggerV2 } from '@smarteverything/domain';
import type { DeviceLike } from './capability-choices';
import { computersOf, offers } from './computer-steps';
import type { Template } from './templates';

export type ComputerFeatures = ReadonlyMap<string, readonly ComputerFeature[]>;

interface ComputerIdea {
  readonly key: string;
  readonly feature: ComputerFeature;
  readonly name: (label: string) => string;
  readonly title: (label: string) => string;
  readonly why: string;
  readonly when: TriggerV2;
  readonly step: (computer: string) => StepV2;
}

const IDEAS: readonly ComputerIdea[] = [
  {
    key: 'quiet',
    name: (label) => `${label} bedtime volume`,
    feature: 'audio',
    title: (label) => `Turn ${label} down at bedtime`,
    why: 'Keeps the volume low late at night.',
    when: { on: 'time', at: '22:30' },
    step: (computer) => ({
      do: 'audio',
      computer,
      change: { action: 'volume', level: 25, kind: 'output' },
    }),
  },
  {
    key: 'dim',
    name: (label) => `${label} night brightness`,
    feature: 'brightness',
    title: (label) => `Dim ${label}’s screens at night`,
    why: 'Easier on the eyes after dark.',
    when: { on: 'time', at: '22:00' },
    step: (computer) => ({
      do: 'display',
      computer,
      change: { action: 'brightness', level: 30 },
    }),
  },
  {
    key: 'warm',
    name: (label) => `${label} night light`,
    feature: 'night_light',
    title: (label) => `Warm ${label}’s screens at sunset`,
    why: 'Switches night light on when the sun goes down.',
    when: { on: 'sun', event: 'sunset' },
    step: (computer) => ({
      do: 'display',
      computer,
      change: { action: 'night_light', mode: 'on', temperatureKelvin: 3500 },
    }),
  },
];

export function computerTemplates(
  devices: readonly DeviceLike[],
  features: ComputerFeatures,
): Template[] {
  return computersOf(devices).flatMap((computer) =>
    IDEAS.filter((idea) => {
      const known = features.get(computer.id);
      return known !== undefined && offers(known, idea.feature);
    }).map((idea) => ({
      id: `computer-${idea.key}:${computer.id}`,
      deviceId: computer.id,
      title: idea.title(computer.label),
      why: idea.why,
      draft: {
        name: idea.name(computer.label),
        enabled: true,
        automation: { when: [idea.when], steps: [idea.step(computer.id)] },
      },
    })),
  );
}
