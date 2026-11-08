import { STATIC_KIND_LOOKUP } from '@smarteverything/domain';
import {
  EMPTY_LAYOUT,
  NODE_REGISTRY,
  type FlowNode,
  type PortValue,
} from '@smarteverything/domain';
import type { CheckContext } from '@smarteverything/flow/check/shapes';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DocumentStore } from '../../model/editor/document-store';
import { automation, idOf, note, start } from '../../model/graph/graph-scene-fixtures';
import { FREE_POINT, openAtDrop, type InsertPoint } from '../palette/armed-insert';
import { dropPinOf, execPinOf, valuePinOf, type ValuePin } from '../palette/pin-filter';
import { runInsertion, kindRequestOf, type InsertEnv } from './insert-choice';
import { intentRuntime } from './use-intent-runtime';

const check: CheckContext = {
  kinds: (id) => NODE_REGISTRY.get(id),
  automations: () => undefined,
  scopeOutputs: () => [],
  references: () => false,
  functions: () => undefined,
  secrets: new Set(),
};

const SNIPPET: readonly FlowNode[] = [
  {
    id: '00000000-0000-4000-8000-0000000000e1',
    key: 'first',
    kind: 'notify.feed',
    ports: { message: { lit: 'one' } },
  },
  {
    id: '00000000-0000-4000-8000-0000000000e2',
    key: 'second',
    kind: 'notify.feed',
    ports: { message: { lit: 'two' } },
  },
];

function setup(): { readonly store: DocumentStore; readonly env: InsertEnv } {
  const store = new DocumentStore(
    automation([start('a'), note('a', 'b'), note('b', 'c'), note('c')], { triggers: [] }),
    STATIC_KIND_LOOKUP,
    EMPTY_LAYOUT,
  );
  let count = 0;
  const env: InsertEnv = {
    snippet: (id) => (id === 'snippet:pair' ? SNIPPET : undefined),
    intent: {
      store,
      clipboard: { read: () => Promise.resolve(''), write: () => Promise.resolve() },
      runtime: {
        newId: () => {
          count += 1;
          return `00000000-0000-4000-9000-${String(count).padStart(12, '0')}`;
        },
        density: 'touch',
        direction: 'ltr',
        check,
        kinds: NODE_REGISTRY,
        sizes: new Map(),
      },
    },
  };
  return { store, env };
}

function after(store: DocumentStore, key: string): InsertPoint {
  const pin = execPinOf(store.state.get().program, idOf(key), 'next', STATIC_KIND_LOOKUP);
  if (pin === undefined) throw new Error(`no exit on ${key}`);
  return { pin, at: null, filtered: true };
}

function messageOf(ports: Record<string, PortValue> | undefined): unknown {
  const value = ports?.['message'];
  return value !== undefined && 'lit' in value ? value.lit : undefined;
}

const keysOf = (store: DocumentStore): string[] =>
  store.state
    .get()
    .program.nodes.map((node) => node.key)
    .sort();

let native = 0;

vi.mock('expo-crypto', () => ({
  randomUUID: (): string => {
    native += 1;
    return `00000000-0000-4000-a000-${String(native).padStart(12, '0')}`;
  },
}));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('kindRequestOf', () => {
  it('turns each palette choice into a step kind and its starting values', () => {
    expect(kindRequestOf({ source: 'node', kindId: 'flow.wait' })).toEqual({ kind: 'flow.wait' });
    expect(kindRequestOf({ source: 'function', functionId: 'f1' })).toEqual({
      kind: 'fn.call',
      ports: { fn: { lit: 'f1' } },
    });
    expect(kindRequestOf({ source: 'preset', presetId: 'p', control: 'power' })).toEqual({
      kind: 'device.set',
      ports: { control: { lit: 'power' } },
    });
    expect(kindRequestOf({ source: 'snippet', snippetId: 's' })).toBeUndefined();
    expect(kindRequestOf({ source: 'new-reusable' })).toBeUndefined();
  });
});

function decisionPin(store: DocumentStore): ValuePin {
  store.apply([
    {
      op: 'add',
      node: { kind: 'flow.if', key: 'check', branches: [{ id: idOf('row'), when: { lit: true } }] },
      after: { key: 'a', port: 'next' },
    },
  ]);
  const program = store.state.get().program;
  const decision = program.nodes.find((node) => node.key === 'check');
  const pin = valuePinOf(
    program,
    decision?.id ?? '',
    `v:row:${decision?.branches?.[0]?.id ?? ''}:when`,
    NODE_REGISTRY,
  );
  if (pin === undefined) throw new Error('the decision has no condition pin');
  return pin;
}

describe('runInsertion of a step', () => {
  it('splices the step into the wire as one undo step and selects it', () => {
    const { store, env } = setup();
    const result = runInsertion(
      { choice: { source: 'node', kindId: 'flow.wait' }, point: after(store, 'a') },
      env,
    );
    expect(result.t === 'done' && result.outcome.ok).toBe(true);
    const wait = store.state.get().program.nodes.find((node) => node.kind === 'flow.wait');
    expect(store.state.get().program.nodes.find((node) => node.key === 'a')?.to).toEqual({
      next: wait?.key,
    });
    expect(wait?.to).toEqual({ next: 'b' });
    expect(store.state.get().selection.ids).toEqual([wait?.id]);
    store.undo();
    expect(keysOf(store)).toEqual(['a', 'b', 'c', 'start']);
  });

  it('places a free step at the point it was dropped', () => {
    const { store, env } = setup();
    const result = runInsertion(
      {
        choice: { source: 'node', kindId: 'flow.wait' },
        point: { pin: null, at: { x: 640, y: 200 }, filtered: false },
      },
      env,
    );
    expect(result.t === 'done' && result.outcome.ok).toBe(true);
    const wait = store.state.get().program.nodes.find((node) => node.kind === 'flow.wait');
    expect(store.state.get().layout.nodes[wait?.id ?? '']).toEqual({ x: 640, y: 200 });
    expect(wait?.to).toBeUndefined();
  });

  it('adds a function call with the chosen Custom Node', () => {
    const { store, env } = setup();
    runInsertion({ choice: { source: 'function', functionId: 'f1' }, point: FREE_POINT }, env);
    const call = store.state.get().program.nodes.find((node) => node.kind === 'fn.call');
    expect(call?.ports?.['fn']).toEqual({ lit: 'f1' });
  });

  it('adds a trigger to the automation instead of putting it on the suggested wire', () => {
    const { store, env } = setup();
    const point = { ...after(store, 'c'), filtered: false };
    const result = runInsertion(
      {
        choice: { source: 'trigger-preset', presetId: 't', kindId: 'trigger.interval', ports: {} },
        point,
      },
      env,
    );
    expect(result.t === 'done' && result.outcome.ok).toBe(true);
    const program = store.state.get().program;
    expect(program.kind === 'automation' && program.triggers.map((item) => item.kind)).toEqual([
      'trigger.interval',
    ]);
    expect(program.nodes.find((node) => node.key === 'c')?.to).toBeUndefined();
  });

  it('adds a step and a trigger on an engine without crypto.randomUUID, as on Android', () => {
    vi.stubGlobal('crypto', {
      getRandomValues: globalThis.crypto.getRandomValues.bind(globalThis.crypto),
    });
    const { store, env } = setup();
    const runtime = intentRuntime('touch', check, NODE_REGISTRY, new Map());
    const onDevice: InsertEnv = { ...env, intent: { ...env.intent, runtime } };
    const step = runInsertion(
      { choice: { source: 'node', kindId: 'notify.feed' }, point: FREE_POINT },
      onDevice,
    );
    const trigger = runInsertion(
      { choice: { source: 'node', kindId: 'trigger.interval' }, point: after(store, 'c') },
      onDevice,
    );
    expect(step.t === 'done' && step.outcome.ok).toBe(true);
    expect(trigger.t === 'done' && trigger.outcome.ok).toBe(true);
    const program = store.state.get().program;
    expect(program.nodes.filter((node) => node.kind === 'notify.feed')).toHaveLength(4);
    expect(native).toBeGreaterThanOrEqual(2);
    expect(program.kind === 'automation' && program.triggers.map((item) => item.kind)).toEqual([
      'trigger.interval',
    ]);
  });

  it('adds a light.set preset as a step with its ports and not as a trigger', () => {
    const { store, env } = setup();
    const point = { ...after(store, 'c'), filtered: false };
    const result = runInsertion(
      {
        choice: {
          source: 'kind-preset',
          presetId: 'light.set.warm_white',
          kindId: 'light.set',
          ports: { power: 'on', colorTemperature: 2700 },
        },
        point,
      },
      env,
    );
    expect(result.t === 'done' && result.outcome.ok).toBe(true);
    const program = store.state.get().program;
    const added = program.nodes.find((node) => node.kind === 'light.set');
    expect(added?.ports?.['colorTemperature']).toEqual({ lit: 2700 });
    expect(program.kind === 'automation' && program.triggers).toEqual([]);
  });

  it('connects the new value step to the value pin it was opened from', () => {
    const { store, env } = setup();
    const pin = decisionPin(store);
    const result = runInsertion(
      {
        choice: { source: 'node', kindId: 'logic.compare' },
        point: { pin, at: null, filtered: true },
      },
      env,
    );
    expect(result.t === 'done' && result.outcome.ok).toBe(true);
    const nodes = store.state.get().program.nodes;
    const compare = nodes.find((node) => node.kind === 'logic.compare');
    expect(nodes.find((node) => node.key === 'check')?.branches?.[0]?.when).toEqual({
      wire: { from: compare?.key, port: 'result' },
    });
  });
});

describe('runInsertion of a snippet', () => {
  it('adds the chain in the wire, keeps its order and the old target', () => {
    const { store, env } = setup();
    const result = runInsertion(
      { choice: { source: 'snippet', snippetId: 'snippet:pair' }, point: after(store, 'a') },
      env,
    );
    expect(result.t === 'done' && result.outcome.ok).toBe(true);
    const program = store.state.get().program;
    const first = program.nodes.find((node) => messageOf(node.ports) === 'one');
    const second = program.nodes.find((node) => messageOf(node.ports) === 'two');
    expect(program.nodes.find((node) => node.key === 'a')?.to).toEqual({ next: first?.key });
    expect(first?.to).toEqual({ next: second?.key });
    expect(second?.to).toEqual({ next: 'b' });
    store.undo();
    expect(keysOf(store)).toEqual(['a', 'b', 'c', 'start']);
  });

  it('refuses a snippet that is gone', () => {
    const { store, env } = setup();
    const missing = runInsertion(
      { choice: { source: 'snippet', snippetId: 'nope' }, point: FREE_POINT },
      env,
    );
    expect(missing.t === 'done' && missing.outcome.ok).toBe(false);
    expect(keysOf(store)).toEqual(['a', 'b', 'c', 'start']);
  });

  it('hands a new Custom Node to the screen', () => {
    const { env } = setup();
    expect(runInsertion({ choice: { source: 'new-reusable' }, point: FREE_POINT }, env)).toEqual({
      t: 'reusable',
    });
  });
});

describe('a wire dropped on empty canvas', () => {
  const at = { x: 2400, y: 1600 };

  function dropped(store: DocumentStore, from: { nodeId: string; handle: string }): InsertPoint {
    const pin = dropPinOf(store.state.get().program, from, STATIC_KIND_LOOKUP);
    if (pin === undefined) throw new Error('no pin');
    return { pin, at, filtered: true };
  }

  it('spawns the only fitting node at the drop and wires the dragged output into it', () => {
    const { store, env } = setup();
    store.apply([{ op: 'add', node: { kind: 'logic.compare', key: 'cmp' } }]);
    const cmp = store.state.get().program.nodes.find((node) => node.key === 'cmp');
    const point = dropped(store, { nodeId: cmp?.id ?? '', handle: 'o:result' });
    const step = openAtDrop(point, { x: 20, y: 30 }, [{ source: 'node', kindId: 'logic.not' }]);
    expect(step.state).toEqual({ phase: 'closed' });
    if (step.insertion === null) throw new Error('no insertion');
    const result = runInsertion(step.insertion, env);
    expect(result.t === 'done' && result.outcome.ok).toBe(true);
    const not = store.state.get().program.nodes.find((node) => node.kind === 'logic.not');
    expect(not?.ports?.['flag']).toEqual({ wire: { from: 'cmp', port: 'result' } });
    expect(store.state.get().layout.nodes[not?.id ?? '']).toEqual(at);
    store.undo();
    expect(store.state.get().program.nodes.some((node) => node.kind === 'logic.not')).toBe(false);
  });

  it('spawns a step at the drop whose exit leads into the dragged exec input', () => {
    const { store, env } = setup();
    const point = dropped(store, { nodeId: idOf('b'), handle: 'x:in' });
    const step = openAtDrop(point, null, [
      { source: 'node', kindId: 'flow.wait' },
      { source: 'node', kindId: 'notify.feed' },
    ]);
    expect(step.insertion).toBeNull();
    expect(step.state).toEqual({ phase: 'choosing', point, anchor: null });
    const result = runInsertion({ choice: { source: 'node', kindId: 'flow.wait' }, point }, env);
    expect(result.t === 'done' && result.outcome.ok).toBe(true);
    const wait = store.state.get().program.nodes.find((node) => node.kind === 'flow.wait');
    expect(wait?.to).toEqual({ next: 'b' });
    expect(store.state.get().layout.nodes[wait?.id ?? '']).toEqual(at);
  });
});
