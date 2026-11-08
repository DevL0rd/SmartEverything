import type {
  AutomationV4,
  GraphNode,
  InputPort,
  PortValue,
  ProgramV4,
  TriggerNode,
} from '@smarteverything/domain';

const ids = new Map<string, string>();

export function idOf(name: string): string {
  const known = ids.get(name);
  if (known !== undefined) return known;
  const made = `00000000-0000-4000-8000-${String(ids.size + 1).padStart(12, '0')}`;
  ids.set(name, made);
  return made;
}

export const TRUE: PortValue = { lit: true };

export function wire(from: string, port: string): PortValue {
  return { wire: { from, port } };
}

export function gnode(key: string, kind: string, extra: Partial<GraphNode> = {}): GraphNode {
  return { id: idOf(key), key, kind, ...extra };
}

export function wired(next: string | undefined): Partial<GraphNode> {
  return next === undefined ? {} : { to: { next } };
}

export function start(next?: string): GraphNode {
  return gnode('start', 'flow.start', wired(next));
}

export function onFailure(next?: string): GraphNode {
  return gnode('failure', 'flow.on_failure', wired(next));
}

export function note(key: string, next?: string, extra: Partial<GraphNode> = {}): GraphNode {
  return gnode(key, 'notify.feed', {
    ports: { message: { lit: key } },
    ...wired(next),
    ...extra,
  });
}

export function reading(key: string): GraphNode {
  return gnode(key, 'device.get', { ports: { device: { lit: 'hall' } } });
}

export function stop(key: string): GraphNode {
  return gnode(key, 'flow.stop');
}

export function join(key: string, next?: string): GraphNode {
  return gnode(key, 'flow.join', wired(next));
}

export interface RowSpec {
  readonly name: string;
  readonly to?: string;
  readonly when?: PortValue;
  readonly label?: string;
}

function rowTo(row: RowSpec): { to?: string } {
  return row.to === undefined ? {} : { to: row.to };
}

function rowName(row: RowSpec): { name?: string } {
  return row.label === undefined ? {} : { name: row.label };
}

export function ifNode(key: string, rows: readonly RowSpec[], otherwise?: string): GraphNode {
  return gnode(key, 'flow.if', {
    branches: rows.map((row) => ({
      id: idOf(`${key}:${row.name}`),
      when: row.when ?? TRUE,
      ...rowName(row),
      ...rowTo(row),
    })),
    ...(otherwise === undefined ? {} : { to: { else: otherwise } }),
  });
}

export function switchNode(key: string, rows: readonly RowSpec[], otherwise?: string): GraphNode {
  return gnode(key, 'flow.switch', {
    ports: { subject: { lit: 'mode' } },
    cases: rows.map((row) => ({
      id: idOf(`${key}:${row.name}`),
      match: { eq: row.name },
      ...rowName(row),
      ...rowTo(row),
    })),
    ...(otherwise === undefined ? {} : { to: { default: otherwise } }),
  });
}

export function loop(
  key: string,
  kind: string,
  wiring: { readonly body?: string; readonly next?: string },
  extra: Partial<GraphNode> = {},
): GraphNode {
  const to = {
    ...(wiring.body === undefined ? {} : { body: wiring.body }),
    ...(wiring.next === undefined ? {} : { next: wiring.next }),
  };
  return gnode(key, kind, { to, ...extra });
}

export function tryNode(
  key: string,
  spec: {
    readonly attempt?: string;
    readonly catches: readonly RowSpec[];
    readonly finally?: string;
    readonly next?: string;
  },
): GraphNode {
  return gnode(key, 'flow.try', {
    catches: spec.catches.map((row) => ({ id: idOf(`${key}:${row.name}`), ...rowTo(row) })),
    to: {
      ...(spec.attempt === undefined ? {} : { try: spec.attempt }),
      ...(spec.finally === undefined ? {} : { finally: spec.finally }),
      ...(spec.next === undefined ? {} : { next: spec.next }),
    },
  });
}

export function together(
  key: string,
  paths: readonly RowSpec[],
  extra: Partial<GraphNode> = {},
): GraphNode {
  return gnode(key, 'flow.parallel', {
    paths: paths.map((path) => ({ name: path.name, ...rowTo(path) })),
    ...extra,
  });
}

export function trigger(key: string, ports: Record<string, PortValue> = {}): TriggerNode {
  return {
    id: idOf(key),
    key,
    kind: 'trigger.interval',
    ports: { every: { lit: 60000 }, ...ports },
  };
}

export interface ProgramExtras {
  readonly triggers?: readonly TriggerNode[];
  readonly inputs?: readonly InputPort[];
  readonly admit?: PortValue;
}

export function automation(nodes: readonly GraphNode[], extras: ProgramExtras = {}): AutomationV4 {
  return {
    version: 4,
    kind: 'automation',
    triggers: [...(extras.triggers ?? [trigger('tick')])],
    ...(extras.admit === undefined ? {} : { admit: extras.admit }),
    inputs: [...(extras.inputs ?? [])],
    outputs: [],
    variables: [],
    nodes: [...nodes],
    policy: { mode: 'single' },
  };
}

export function customNode(nodes: readonly GraphNode[], inputs: readonly InputPort[]): ProgramV4 {
  return {
    version: 4,
    kind: 'function',
    flavour: 'action',
    inputs: [...inputs],
    outputs: [],
    exits: ['done'],
    variables: [],
    nodes: [...nodes],
  };
}

export function decisionProgram(): ProgramV4 {
  const dark = { name: 'dark', to: 'lamp', when: wire('sensor', 'value') };
  return automation([
    start('check'),
    reading('sensor'),
    ifNode('check', [dark], 'dim'),
    note('lamp', 'after'),
    note('dim', 'after'),
    note('after'),
  ]);
}

export function earlyEndProgram(): ProgramV4 {
  return automation([
    start('check'),
    ifNode('check', [{ name: 'dark', to: 'lamp' }]),
    note('lamp'),
  ]);
}

export function switchProgram(): ProgramV4 {
  return automation([
    start('mode'),
    switchNode(
      'mode',
      [
        { name: 'bright', to: 'a' },
        { name: 'dim', to: 'b' },
      ],
      'c',
    ),
    note('a'),
    note('b'),
    note('c'),
  ]);
}

export function guardProgram(): ProgramV4 {
  return automation([
    start('only'),
    gnode('only', 'flow.guard', { ports: { condition: wire('sensor', 'value') }, ...wired('go') }),
    reading('sensor'),
    note('go'),
  ]);
}

export function forkProgram(choice: string): ProgramV4 {
  const options = { join: { lit: choice } };
  return automation([
    start('both'),
    together(
      'both',
      [
        { name: 'left', to: 'l' },
        { name: 'right', to: 'r' },
      ],
      { ports: options },
    ),
    note('l', 'meet'),
    note('r', 'meet'),
    join('meet', 'after'),
    note('after'),
  ]);
}

export function loopProgram(): ProgramV4 {
  return automation([
    start('each'),
    loop(
      'each',
      'flow.for_each',
      { body: 'show', next: 'done' },
      {
        ports: { items: { lit: [1, 2] }, collect: wire('each', 'item') },
      },
    ),
    note('show', undefined, { ports: { message: wire('each', 'item') } }),
    note('done'),
  ]);
}

export function lastItemProgram(): ProgramV4 {
  return automation([
    start('each'),
    loop('each', 'flow.for_each', { body: 'show' }, { ports: { items: { lit: [1, 2] } } }),
    note('show', undefined, { ports: { message: wire('each', 'last') } }),
  ]);
}

export function tryProgram(): ProgramV4 {
  return automation([
    start('guarded'),
    tryNode('guarded', {
      attempt: 'risky',
      catches: [{ name: 'oops', to: 'tell' }],
      finally: 'tidy',
      next: 'after',
    }),
    note('risky'),
    note('tell', undefined, { ports: { message: wire('guarded', 'error') } }),
    note('tidy'),
    note('after'),
  ]);
}

export function laneRowsProgram(): ProgramV4 {
  const waiting = gnode('hold', 'flow.wait_event', {
    ports: { source: { lit: 'device' }, kind: { lit: 'changed' }, timeout: { lit: 5000 } },
    to: { timedOut: 'late', next: 'routed' },
  });
  return automation([
    start('hold'),
    waiting,
    note('late'),
    note('routed', 'after', {
      policy: { onError: 'route' },
      to: { onError: 'rescue', next: 'after' },
    }),
    note('rescue'),
    note('after', 'temp'),
    gnode('temp', 'device.set_temporarily', {
      ports: { target: { lit: 'hall' } },
      to: { body: 'inside', next: 'end' },
    }),
    note('inside'),
    note('end'),
  ]);
}

export function inputsProgram(): ProgramV4 {
  const level = { name: 'level', type: { t: 'number' as const }, required: true };
  return customNode(
    [start('show'), note('show', undefined, { ports: { message: wire('inputs', 'level') } })],
    [level],
  );
}

export function admitProgram(): ProgramV4 {
  return automation([start('only'), reading('sensor'), note('only')], {
    admit: wire('sensor', 'value'),
    triggers: [trigger('first'), trigger('second')],
  });
}

export function failureProgram(): ProgramV4 {
  return automation([start('main'), note('main'), onFailure('cleanup'), note('cleanup')]);
}

export function brokenProgram(): ProgramV4 {
  return automation([start('a'), note('a', 'start')]);
}

export function unknownTargetProgram(): ProgramV4 {
  return automation([start('a'), note('a', 'ghost')]);
}

export function blockProgram(blocks: number): ProgramV4 {
  const nodes: GraphNode[] = [start(blocks > 0 ? 'if0' : undefined)];
  for (let index = 0; index < blocks; index += 1) {
    const after = index + 1 < blocks ? `if${String(index + 1)}` : undefined;
    const row = { name: 'on', to: `a${String(index)}`, when: wire(`r${String(index)}`, 'value') };
    nodes.push(
      reading(`r${String(index)}`),
      ifNode(`if${String(index)}`, [row], `b${String(index)}`),
      note(`a${String(index)}`, `m${String(index)}`),
      note(`b${String(index)}`, `m${String(index)}`),
      note(`m${String(index)}`, after),
    );
  }
  return automation(nodes);
}
