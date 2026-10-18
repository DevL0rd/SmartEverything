import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { ConditionV2, StepV2, TriggerV2 } from '@smarteverything/domain';
import { catalogFixture, SCENE_ID, VALUE_ID } from '../model/catalog-fixture';
import { LAMP, PURIFIER } from '../model/test-devices';

vi.mock('../../../store/people', () => ({ useProfiles: (): [] => [] }));
vi.mock('../../../store/selectors', () => ({
  useRows: (): [] => [],
  useDevices: (): [] => [],
  useIsOwner: (): boolean => true,
}));
vi.mock('../../../design/colour', () => ({
  useColour: (): string => '#000000',
  withAlpha: (): string => '#000000',
}));
vi.mock('../../../components/switch', () => ({
  Switch: (): null => null,
  SwitchTrack: (): null => null,
}));
vi.mock('../../../components/sheet', () => ({
  Sheet: ({ children }: { readonly children: unknown }): unknown => children,
}));
vi.mock('./step-tree', () => ({
  useStepTree: (): unknown => ({
    root: [],
    catalog: catalogFixture(),
    problems: {},
    change: (): undefined => undefined,
    open: (): undefined => undefined,
  }),
}));
vi.mock('../data/use-speech-sources', () => ({ useSpeechSources: (): [] => [] }));
vi.mock('../data/use-automation-tools', () => ({
  useAutomationTools: (): unknown => ({
    isPending: false,
    isError: false,
    data: [
      {
        name: 'run_scene',
        title: 'Run a scene',
        description: 'Runs one scene now.',
        input_schema: { type: 'object', properties: { sceneId: { type: 'string' } } },
        read_only: false,
        destructive: false,
      },
    ],
  }),
}));

const { StepFields } = await import('./step-fields');
const { ConditionFields } = await import('./condition-fields');
const { RunBehaviourFields } = await import('./run-behaviour-fields');
const { InputsFields } = await import('./inputs-section');
const { TriggerFields } = await import('./trigger-fields');
const { StepList } = await import('./step-list');
const { ROOT_BLOCK } = await import('../model/steps');

const CATALOG = catalogFixture({
  callable: [
    {
      id: '71000000-0000-4000-8000-000000000001',
      name: 'Fade',
      reusable: true,
      inputs: [{ name: 'level', type: 'number' }],
    },
  ],
});
const CALLEE = '71000000-0000-4000-8000-000000000001';

const STEPS: readonly StepV2[] = [
  { do: 'set', target: { device: LAMP }, control: 'power', to: true },
  { do: 'set', target: { device: LAMP }, control: 'brightness', to: 20, for: 600_000, priority: 2 },
  { do: 'set', target: { device: LAMP }, control: 'brightness', by: 10, for: 60_000 },
  { do: 'set', target: { device: PURIFIER }, control: 'filter_reset', to: null },
  { do: 'set', target: { devices: [LAMP, PURIFIER] }, control: 'power', to: false },
  {
    do: 'set',
    target: { device: LAMP },
    control: 'brightness',
    to: { from: { value: VALUE_ID }, add: 5, max: 90 },
  },
  { do: 'scene', scene: SCENE_ID },
  { do: 'wait', ms: 90_000 },
  { do: 'notify', message: 'Hi' },
  { do: 'ai', person: LAMP, instruction: 'Look' },
  { do: 'tool', person: LAMP, tool: 'speak', args: { text: 'x' } },
  { do: 'tool', person: LAMP, tool: 'run_scene', args: { sceneId: SCENE_ID } },
  {
    do: 'tool',
    person: LAMP,
    tool: 'speak',
    args: { target: { kind: 'device', deviceId: LAMP }, text: 'Dinner' },
  },
  { do: 'value', value: VALUE_ID, op: 'add', amount: 3 },
  { do: 'if', branches: [{ id: CALLEE, when: { daylight: 'night' }, then: [] }], else: [] },
  { do: 'repeat', times: 3, gapMs: 1000, limitMs: 60_000, steps: [{ do: 'wait', ms: 1000 }] },
  { do: 'repeat', while: { time: { days: [1] } }, steps: [{ do: 'wait', ms: 1000 }] },
  { do: 'run', automation: CALLEE, wait: true, inputs: { level: 3 } },
  { do: 'stop' },
  { do: 'stop', automation: CALLEE, key: 'k' },
];

const TRIGGERS: readonly TriggerV2[] = [
  { on: 'time', at: '07:00', days: [1, 2] },
  { on: 'sun', event: 'sunset', offsetMinutes: -15 },
  { on: 'every', minutes: 90 },
  {
    on: 'signal',
    source: 'device',
    kind: 'state',
    subject: PURIFIER,
    field: 'pm25',
    test: { is: 'gt', to: 20 },
    holdSeconds: 30,
  },
  { on: 'signal', source: 'event', kind: 'sound', subject: LAMP, match: { detection: 'baby_cry' } },
  {
    on: 'signal',
    source: 'weather',
    kind: 'forecast',
    field: 'temperature',
    test: { is: 'gt', to: 30 },
  },
  {
    on: 'signal',
    source: 'weather',
    kind: 'forecast',
    field: 'kind',
    test: { is: 'in', to: ['rain'] },
  },
  { on: 'signal', source: 'health', kind: 'x' },
  { on: 'speech', phrase: 'lights' },
];

const CONDITIONS: readonly ConditionV2[] = [
  { compare: { device: PURIFIER, control: 'pm25' }, test: { is: 'between', min: 1, max: 5 } },
  { compare: { value: VALUE_ID }, test: { is: 'gt', to: 1 } },
  { compare: { weather: 'kind' }, test: { is: 'in', to: ['rain'] } },
  { compare: { from: { weather: 'humidity' }, add: 1 }, test: { is: 'lt', to: 50 } },
  { time: { after: '22:00', before: '06:00', days: [1, 2] } },
  { daylight: 'day', sunriseOffset: 15 },
];

describe('the editor forms render', () => {
  it.each(STEPS.map((step, index) => [`${step.do} #${String(index)}`, step] as const))(
    'a form for the step %s',
    (_name, step) => {
      const html = renderToStaticMarkup(
        createElement(StepFields, { step, catalog: CATALOG, onChange: () => undefined }),
      );
      expect(html.length).toBeGreaterThan(0);
    },
  );

  it('lets the owner pick any tool and shows its description and arguments', () => {
    const html = renderToStaticMarkup(
      createElement(StepFields, {
        step: { do: 'tool', person: LAMP, tool: 'run_scene', args: { sceneId: SCENE_ID } },
        catalog: CATALOG,
        onChange: () => undefined,
      }),
    );
    expect(html).toContain('Run a scene');
    expect(html).toContain('Runs one scene now.');
    expect(html).toContain('Find an argument');
  });

  it('shows the speaker and the words for a camera speech step', () => {
    const html = renderToStaticMarkup(
      createElement(StepFields, {
        step: {
          do: 'tool',
          person: LAMP,
          tool: 'speak',
          args: { target: { kind: 'device', deviceId: LAMP }, text: 'Dinner' },
        },
        catalog: CATALOG,
        onChange: () => undefined,
      }),
    );
    expect(html).toContain('Words to say');
    expect(html).toContain('Dinner');
  });

  it.each(CONDITIONS.map((condition, index) => [String(index), condition] as const))(
    'a form for the condition #%s',
    (_name, condition) => {
      const html = renderToStaticMarkup(
        createElement(ConditionFields, { catalog: CATALOG, condition, onChange: () => undefined }),
      );
      expect(html.length).toBeGreaterThan(0);
    },
  );

  it.each(TRIGGERS.map((trigger, index) => [`${trigger.on} #${String(index)}`, trigger] as const))(
    'a form for the trigger %s',
    (_name, trigger) => {
      const html = renderToStaticMarkup(
        createElement(TriggerFields, { catalog: CATALOG, trigger, onChange: () => undefined }),
      );
      expect(html.length).toBeGreaterThan(0);
    },
  );

  it('lists nested steps inline inside an If and a Repeat', () => {
    const html = renderToStaticMarkup(createElement(StepList, { block: ROOT_BLOCK, steps: STEPS }));
    expect(html.length).toBeGreaterThan(0);
  });

  it('shows the run behaviour and the inputs', () => {
    const behaviour = renderToStaticMarkup(
      createElement(RunBehaviourFields, {
        run: { mode: 'queue', max: 3, key: 'k' },
        onChange: () => undefined,
      }),
    );
    const inputs = renderToStaticMarkup(
      createElement(InputsFields, {
        inputs: [{ name: 'level', type: 'number' }],
        onChange: () => undefined,
      }),
    );
    expect(behaviour.length).toBeGreaterThan(0);
    expect(inputs.length).toBeGreaterThan(0);
  });
});
