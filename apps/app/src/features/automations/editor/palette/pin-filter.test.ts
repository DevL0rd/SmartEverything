import { STATIC_KIND_LOOKUP } from '@smarteverything/domain';
import {
  NODE_REGISTRY,
  execClassOf,
  isAssignable,
  isExecNode,
  type FlowType,
} from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import {
  automation,
  decisionProgram,
  idOf,
  loop,
  loopProgram,
  note,
  start,
  gnode,
} from '../../model/graph/graph-scene-fixtures';
import { parseGraphIntent } from '../host/apply-intents';
import { NEW_REUSABLE_ENTRY, functionEntry, shippedNodeEntries } from './palette-categories';
import {
  dropPinOf,
  execPinOf,
  filterEntriesForPin,
  linkRequest,
  outputFor,
  pinContext,
  pinInsertion,
  valuePinOf,
  type PinSource,
} from './pin-filter';

const ENTRIES = shippedNodeEntries(NODE_REGISTRY.kinds);
const BOOLEAN: FlowType = { t: 'boolean' };
const ENTRIES_WITH_OTHERS = [
  ...ENTRIES,
  NEW_REUSABLE_ENTRY,
  functionEntry({
    id: '00000000-0000-4000-8000-0000000000f1',
    name: 'Dim gently',
    description: null,
    category: null,
    icon: null,
    editable: true,
    revision: 1,
    interface: { flavour: 'action', inputs: [], outputs: [], exits: ['done'] },
    interfaceHash: 'hash',
    users: 0,
    createdBy: null,
    updatedAt: null,
  }),
];

function kindsFor(pin: PinSource): readonly string[] {
  return filterEntriesForPin(ENTRIES, pin, NODE_REGISTRY).flatMap((entry) =>
    entry.kindId === null ? [] : [entry.kindId],
  );
}

describe('exec pins', () => {
  const pin = execPinOf(decisionProgram(), idOf('check'), 'else', STATIC_KIND_LOOKUP);

  it('knows the pin of a real output and nothing else', () => {
    expect(pin).toMatchObject({ kind: 'exec', nodeKey: 'check', port: 'else' });
    expect(
      execPinOf(decisionProgram(), idOf('check'), 'ghost', STATIC_KIND_LOOKUP),
    ).toBeUndefined();
    expect(
      execPinOf(decisionProgram(), idOf('missing'), 'else', STATIC_KIND_LOOKUP),
    ).toBeUndefined();
  });

  it('keeps Custom Nodes, snippets and the new Custom Node entry', () => {
    if (pin === undefined) throw new Error('no pin');
    const others = ENTRIES_WITH_OTHERS.filter((entry) => entry.kindId === null);
    expect(others.length).toBeGreaterThan(0);
    expect(filterEntriesForPin(ENTRIES_WITH_OTHERS, pin, NODE_REGISTRY)).toEqual(
      expect.arrayContaining(others),
    );
  });

  it('shows only steps and keeps structural kinds and triggers out', () => {
    if (pin === undefined) throw new Error('no pin');
    const kinds = kindsFor(pin);
    expect(kinds.length).toBeGreaterThan(10);
    expect(kinds.every((id) => isExecNode(id, STATIC_KIND_LOOKUP))).toBe(true);
    expect(kinds).toContain('flow.if');
    expect(kinds).toContain('flow.parallel');
    expect(kinds).not.toContain('flow.start');
    expect(kinds).not.toContain('flow.join');
    expect(kinds.some((id) => id.startsWith('trigger.'))).toBe(false);
    expect(kinds).not.toContain('device.get');
  });

  it('inserts after the pin', () => {
    if (pin === undefined) throw new Error('no pin');
    const made = pinInsertion(pin, 'notify.feed', NODE_REGISTRY, { x: 4, y: 8 });
    expect(made?.link).toBeUndefined();
    expect(made?.insert).toEqual({
      kind: 'notify.feed',
      after: { nodeId: idOf('check'), port: 'else' },
      point: { x: 4, y: 8 },
    });
    expect(parseGraphIntent({ type: 'insert', request: made?.insert })).toBeDefined();
  });
});

describe('value pins', () => {
  const program = automation([
    start('check'),
    gnode('check', 'flow.guard', { ports: { condition: { lit: true } }, to: { next: 'x' } }),
    note('x'),
  ]);

  it('reads the expected type from the input it feeds', () => {
    const condition = valuePinOf(program, idOf('check'), 'v:condition', NODE_REGISTRY);
    expect(condition?.expected?.t).toBe('boolean');
    expect(valuePinOf(program, idOf('check'), 'v:ghost', NODE_REGISTRY)?.expected).toBeUndefined();
    expect(valuePinOf(program, idOf('check'), 'x:next', NODE_REGISTRY)).toBeUndefined();
    expect(valuePinOf(program, idOf('missing'), 'v:condition', NODE_REGISTRY)).toBeUndefined();
  });

  it('treats a branch condition and the admit pin as yes or no', () => {
    const decision = decisionProgram();
    const row = `v:row:${idOf('check:dark')}:when`;
    expect(valuePinOf(decision, idOf('check'), row, NODE_REGISTRY)?.expected).toEqual(BOOLEAN);
    expect(valuePinOf(decision, idOf('start'), 'v:admit', NODE_REGISTRY)?.expected).toEqual(
      BOOLEAN,
    );
  });

  it('shows value kinds with a compatible type only', () => {
    const pin = valuePinOf(program, idOf('check'), 'v:condition', NODE_REGISTRY);
    if (pin === undefined) throw new Error('no pin');
    const entries = filterEntriesForPin(ENTRIES, pin, NODE_REGISTRY);
    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) {
      expect(
        entry.kindId !== null && execClassOf(entry.kindId, STATIC_KIND_LOOKUP) === 'value',
      ).toBe(true);
      expect(entry.trigger).toBe(false);
      expect(entry.gives.some((type) => isAssignable(type, BOOLEAN))).toBe(true);
    }
  });

  it('is stricter for a number than for anything', () => {
    const number = filterEntriesForPin(
      ENTRIES,
      {
        kind: 'value',
        nodeId: idOf('check'),
        handle: 'v:x',
        expected: { t: 'number' },
      },
      NODE_REGISTRY,
    );
    const anything = filterEntriesForPin(
      ENTRIES,
      {
        kind: 'value',
        nodeId: idOf('check'),
        handle: 'v:x',
        expected: null,
      },
      NODE_REGISTRY,
    );
    expect(number.length).toBeGreaterThan(0);
    expect(number.length).toBeLessThan(anything.length);
  });

  it('inserts the node and links its first compatible output to the pin', () => {
    const pin = valuePinOf(program, idOf('check'), 'v:condition', NODE_REGISTRY);
    if (pin === undefined) throw new Error('no pin');
    const kind = filterEntriesForPin(ENTRIES, pin, NODE_REGISTRY)[0]?.kindId;
    if (kind === null || kind === undefined) throw new Error('no entry');
    const made = pinInsertion(pin, kind, NODE_REGISTRY);
    const output = outputFor(kind, BOOLEAN, NODE_REGISTRY);
    expect(output).toBeDefined();
    expect(made?.insert).toEqual({ kind });
    if (made?.link === undefined) throw new Error('no link');
    expect(made.link).toEqual({
      t: 'out',
      output,
      target: { nodeId: idOf('check'), handle: 'v:condition' },
    });
    expect(linkRequest(made.link, 'new-id')).toEqual({
      from: { nodeId: 'new-id', handle: `o:${output ?? ''}` },
      to: { nodeId: idOf('check'), handle: 'v:condition' },
    });
  });

  it('refuses to link a kind with no compatible output', () => {
    const pin = valuePinOf(program, idOf('check'), 'v:condition', NODE_REGISTRY);
    if (pin === undefined) throw new Error('no pin');
    expect(pinInsertion(pin, 'notify.feed', NODE_REGISTRY)).toBeUndefined();
    expect(outputFor('notify.feed', BOOLEAN, NODE_REGISTRY)).toBeUndefined();
  });
});

describe('pinContext', () => {
  it('ranks steps for an exec pin and values for a value pin', () => {
    const program = decisionProgram();
    const pin = execPinOf(program, idOf('check'), 'else', STATIC_KIND_LOOKUP);
    if (pin === undefined) throw new Error('no pin');
    expect(pinContext(program, pin, STATIC_KIND_LOOKUP)).toMatchObject({
      slot: 'step',
      inLoop: false,
    });
    expect(
      pinContext(
        program,
        { kind: 'value', nodeId: '', handle: '', expected: BOOLEAN },
        STATIC_KIND_LOOKUP,
      ),
    ).toMatchObject({
      slot: 'value',
      expected: BOOLEAN,
    });
  });

  it('knows a pin inside a loop body, on the body lane or on a step in it', () => {
    const program = loopProgram();
    const lane = execPinOf(program, idOf('each'), 'body', STATIC_KIND_LOOKUP);
    const step = execPinOf(program, idOf('show'), 'next', STATIC_KIND_LOOKUP);
    const after = execPinOf(program, idOf('each'), 'next', STATIC_KIND_LOOKUP);
    if (lane === undefined || step === undefined || after === undefined) throw new Error('no pin');
    expect(pinContext(program, lane, STATIC_KIND_LOOKUP).inLoop).toBe(true);
    expect(pinContext(program, step, STATIC_KIND_LOOKUP).inLoop).toBe(true);
    expect(pinContext(program, after, STATIC_KIND_LOOKUP).inLoop).toBe(false);
  });

  it('is false outside any loop', () => {
    const program = automation([
      start('each'),
      loop('each', 'flow.for_each', { body: 'a' }, { ports: { items: { lit: [1] } } }),
      note('a'),
    ]);
    const first = execPinOf(program, idOf('start'), 'next', STATIC_KIND_LOOKUP);
    if (first === undefined) throw new Error('no pin');
    expect(pinContext(program, first, STATIC_KIND_LOOKUP).inLoop).toBe(false);
  });
});

describe('pins a wire is dragged out of into empty space', () => {
  const program = automation([start('a'), note('a'), gnode('cmp', 'logic.compare')]);

  it('offers only nodes that take the dragged output type as an input', () => {
    const pin = dropPinOf(program, { nodeId: idOf('cmp'), handle: 'o:result' }, NODE_REGISTRY);
    expect(pin).toEqual({
      kind: 'valueOut',
      nodeId: idOf('cmp'),
      handle: 'o:result',
      given: BOOLEAN,
    });
    if (pin === undefined) throw new Error('no pin');
    const kinds = kindsFor(pin);
    expect(kinds).toContain('logic.not');
    expect(kinds).not.toContain('flow.wait');
    for (const kind of kinds) {
      const inputs = NODE_REGISTRY.get(kind)?.inputs ?? [];
      expect(inputs.some((input) => isAssignable(BOOLEAN, input.type))).toBe(true);
      expect(kind.startsWith('trigger.')).toBe(false);
    }
  });

  it('offers only steps with an exit when dragged out of an exec input', () => {
    const pin = dropPinOf(program, { nodeId: idOf('a'), handle: 'x:in' }, NODE_REGISTRY);
    expect(pin).toEqual({ kind: 'execIn', nodeId: idOf('a'), handle: 'x:in' });
    if (pin === undefined) throw new Error('no pin');
    const kinds = kindsFor(pin);
    expect(kinds).toContain('notify.feed');
    expect(kinds).not.toContain('logic.compare');
    expect(kinds).not.toContain('flow.stop');
    expect(kinds.every((kind) => isExecNode(kind, NODE_REGISTRY))).toBe(true);
  });

  it('offers value nodes that produce the type when dragged out of a value input', () => {
    const pin = dropPinOf(program, { nodeId: idOf('a'), handle: 'v:message' }, NODE_REGISTRY);
    expect(pin?.kind).toBe('value');
    if (pin === undefined) throw new Error('no pin');
    expect(kindsFor(pin).every((kind) => execClassOf(kind, NODE_REGISTRY) === 'value')).toBe(true);
  });
});
