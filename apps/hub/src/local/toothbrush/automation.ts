import type { DeviceFamily } from '@smarteverything/domain';
import {
  registerDriverAutomation,
  type DriverAutomationInput,
} from '../../automations/plugin-kinds/contributions';
import type { PluginKindCatalog } from '../../automations/plugin-kinds/catalog';
import {
  automation,
  eventTrigger,
  ports,
  type PortKind,
} from '../../plugins/builtin/automation-kit';

export const TOOTHBRUSH_AUTOMATION_ID = 'toothbrush';

const BRUSH_FAMILIES: readonly DeviceFamily[] = ['toothbrush'];

const BRUSH: PortKind<string> = {
  type: { t: 'ref', of: 'device', families: [...BRUSH_FAMILIES] },
};

function maybe<V>(kind: PortKind<V>): PortKind<V | undefined> {
  return { type: { t: 'optional', of: kind.type } };
}

const BRUSH_FILTER = {
  kind: BRUSH,
  title: 'Toothbrush',
  description: 'Only for this toothbrush.',
  match: 'subject',
} as const;

const PERCENT = ports.number({ integer: true, min: 0, max: 100, unit: '%' });

const BRUSHING_FINISHED = eventTrigger({
  id: 'brushing_finished',
  version: 1,
  title: 'Brushing finished',
  description:
    'Fires when a brushing session ends on an electric toothbrush, with how long it lasted, how much of the mouth it reached and whether the brushing goal was met.',
  icon: 'sparkles',
  keywords: ['toothbrush', 'brushing', 'teeth', 'oral-b', 'sonicare', 'dental'],
  summary: '{person} finished brushing with {brush}',
  event: { deviceEvent: 'activity', match: { brushing: 'finished' } },
  filters: {
    brush: BRUSH_FILTER,
    person: {
      kind: ports.ref('person'),
      title: 'Person',
      description: 'Only when this person was brushing.',
      match: 'profileId',
    },
  },
  outputs: {
    brush: { kind: BRUSH, title: 'Toothbrush', from: 'subject' },
    person: { kind: maybe(ports.ref('person')), title: 'Person', from: 'profileId' },
    duration: {
      kind: ports.number({ min: 0, unit: 's' }),
      title: 'Brushing time in seconds',
      from: 'durationS',
    },
    coverage: {
      kind: maybe(PERCENT),
      title: 'Mouth covered in percent',
      from: 'coverage',
    },
    pressureWarnings: {
      kind: maybe(ports.number({ integer: true, min: 0 })),
      title: 'Times pressed too hard',
      from: 'pressureWarnings',
    },
    goalMet: { kind: ports.boolean(), title: 'Brushing goal met', from: 'complete' },
  },
});

interface HeadStage {
  readonly id: string;
  readonly stage: 'warn' | 'due';
  readonly title: string;
  readonly description: string;
  readonly summary: string;
}

function brushHeadTrigger(spec: HeadStage): ReturnType<typeof eventTrigger> {
  return eventTrigger({
    id: spec.id,
    version: 1,
    title: spec.title,
    description: spec.description,
    icon: 'bell',
    keywords: ['toothbrush', 'brush head', 'replace', 'worn', 'oral-b', 'sonicare'],
    summary: spec.summary,
    event: { deviceEvent: 'maintenance', match: { brushHead: spec.stage } },
    filters: { brush: BRUSH_FILTER },
    outputs: {
      brush: { kind: BRUSH, title: 'Toothbrush', from: 'subject' },
      wear: {
        kind: PERCENT,
        title: 'Brush head worn in percent',
        from: 'wearPercent',
      },
    },
  });
}

const BRUSH_HEAD_DUE = brushHeadTrigger({
  id: 'brush_head_due',
  stage: 'due',
  title: 'Brush head needs replacing',
  description: 'Fires when the brush head has worn down to the point where it should be replaced.',
  summary: 'Brush head of {brush} needs replacing',
});

const BRUSH_HEAD_WEARING = brushHeadTrigger({
  id: 'brush_head_wearing',
  stage: 'warn',
  title: 'Brush head is wearing out',
  description: 'Fires when the brush head starts to wear out, before it needs replacing.',
  summary: 'Brush head of {brush} is wearing out',
});

export const TOOTHBRUSH_AUTOMATION: DriverAutomationInput = {
  id: TOOTHBRUSH_AUTOMATION_ID,
  name: 'Toothbrush',
  icon: 'sparkles',
  version: '1.0.0',
  automation: automation({ triggers: [BRUSHING_FINISHED, BRUSH_HEAD_DUE, BRUSH_HEAD_WEARING] }),
};

export function registerToothbrushAutomation(
  catalog: Pick<PluginKindCatalog, 'replace' | 'remove'>,
): () => void {
  return registerDriverAutomation(catalog, TOOTHBRUSH_AUTOMATION);
}
