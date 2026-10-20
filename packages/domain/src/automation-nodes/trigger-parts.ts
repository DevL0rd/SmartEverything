import type { FlowType } from '../automation-v3/types';
import { humanizeEnum } from '../presentation/humanize';
import { SIGNAL_FIRST_PERIODS } from '../signal-timing';
import { defineNodeKind, type InputPortDecl, type NodeKind, type OutputPortDecl } from './define';

export const TEXT: FlowType = { t: 'text' };
export const ANY: FlowType = { t: 'any' };
export const INSTANT: FlowType = { t: 'instant' };
export const NUMBER: FlowType = { t: 'number' };
export const DURATION: FlowType = { t: 'duration' };
export const FLAG: FlowType = { t: 'boolean' };
export const ANY_RECORD: FlowType = { t: 'record', values: ANY };

export function ref(
  of: 'device' | 'room' | 'person' | 'camera' | 'value' | 'automation',
): FlowType {
  return { t: 'ref', of };
}

export function choice(ids: readonly string[]): FlowType {
  return { t: 'choice', options: ids.map((id) => ({ id, label: humanizeEnum(id) })) };
}

export function input(
  name: string,
  type: FlowType,
  description: string,
  extra: Partial<InputPortDecl> = {},
): InputPortDecl {
  return { name, type, required: false, static: true, description, ...extra };
}

export function output(
  name: string,
  type: FlowType,
  description: string,
  optional = false,
): OutputPortDecl {
  return optional ? { name, type, optional, description } : { name, type, description };
}

const SECONDS_UI = { unit: 'ms', step: 1000, min: 0 } as const;

const TIMING_PORTS: Readonly<Record<string, InputPortDecl>> = {
  test: input('test', ANY_RECORD, 'Only fire when the value passes this test.'),
  window: input(
    'window',
    { t: 'record', fields: { of: TEXT, seconds: { t: 'number', integer: true } } },
    'Judge a rolling window of values (average, min, max, rate or count over seconds).',
  ),
  hold: input('hold', DURATION, 'The test must stay true this long before it fires.', {
    ui: SECONDS_UI,
  }),
  debounce: input('debounce', DURATION, 'Decide only after no new signal for this long.', {
    ui: SECONDS_UI,
  }),
  cooldown: input('cooldown', DURATION, 'Fire at most once in this long.', { ui: SECONDS_UI }),
  silentFor: input('silentFor', DURATION, 'Fire when no matching signal arrived for this long.', {
    ui: SECONDS_UI,
  }),
  first: input(
    'first',
    choice(SIGNAL_FIRST_PERIODS),
    'Fire only the first time in the day, week or ever.',
  ),
  rearm: input(
    'rearm',
    NUMBER,
    'After firing, fire again only once the value has crossed back past this.',
  ),
};

export function timing(names?: readonly string[]): readonly InputPortDecl[] {
  return Object.entries(TIMING_PORTS)
    .filter(([name]) => names === undefined || names.includes(name))
    .map(([, port]) => port);
}

export const IGNORE_OWN: InputPortDecl = input(
  'ignoreOwnChanges',
  FLAG,
  'Skip changes this automation made itself to the same device.',
  { default: true },
);

export const AT = output('at', INSTANT, 'When it happened.');

export function trigger(
  fields: Pick<NodeKind, 'id' | 'name' | 'icon' | 'description' | 'summary' | 'keywords'> & {
    readonly inputs: readonly InputPortDecl[];
    readonly outputs: readonly OutputPortDecl[];
    readonly tier?: NodeKind['tier'];
  },
): NodeKind {
  return defineNodeKind({
    category: 'triggers',
    class: 'trigger',
    exits: [],
    access: 'member',
    tier: 'v1',
    ...fields,
  });
}
