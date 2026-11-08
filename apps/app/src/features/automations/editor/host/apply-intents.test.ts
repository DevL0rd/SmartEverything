import { STATIC_KIND_LOOKUP } from '@smarteverything/domain';
import { EMPTY_LAYOUT, NODE_REGISTRY, type Layout, type ProgramV4 } from '@smarteverything/domain';
import type { CheckContext } from '@smarteverything/flow/check/shapes';
import { layoutGraph } from '@smarteverything/flow/graph/layout';
import { applyPatch, type PatchResult } from '@smarteverything/flow/graph/ops/reducer';
import type { PatchOp } from '@smarteverything/flow/graph/ops/schema';
import { describe, expect, it } from 'vitest';
import { automation, idOf, note, start } from '../../model/graph/graph-scene-fixtures';
import {
  applyGraphIntent,
  InvalidGraphIntentError,
  parseGraphIntent,
  type GraphIntent,
} from './apply-intents';
import type { ClipboardPort } from './clipboard-port';
import type { EdgeEndRequest } from './connect-intent';
import type { GraphEditState, GraphStore, IntentEnv, IntentOutcome } from './intent-env';

const check: CheckContext = {
  kinds: (id) => NODE_REGISTRY.get(id),
  automations: () => undefined,
  scopeOutputs: () => [],
  references: () => false,
  functions: () => undefined,
  secrets: new Set(),
};

class FakeStore implements GraphStore {
  history = 0;
  private program: ProgramV4;
  private layout: Layout;
  private selected: readonly string[] = [];
  private depth = 0;
  private pending = false;
  private count = 0;

  constructor(program: ProgramV4) {
    this.program = program;
    const laid = layoutGraph(program, {
      kinds: STATIC_KIND_LOOKUP,
      direction: 'ltr',
      density: 'touch',
    });
    this.layout = { ...EMPTY_LAYOUT, nodes: { ...laid.nodes } };
  }

  readonly state = {
    get: (): GraphEditState => ({
      program: this.program,
      layout: this.layout,
      selection: { ids: this.selected, anchor: this.selected.at(-1) ?? null },
    }),
  };

  readonly apply = (ops: readonly PatchOp[]): PatchResult => {
    const result = applyPatch(this.program, ops, {
      kinds: STATIC_KIND_LOOKUP,
      allowProblems: true,
      newId: () => this.fresh(),
    });
    if (result.ok) {
      this.program = result.program;
      this.record();
    }
    return result;
  };

  readonly editLayout = (edit: (layout: Layout) => Layout): void => {
    const next = edit(this.layout);
    if (next === this.layout) return;
    this.layout = next;
    this.record();
  };

  readonly beginGesture = (): void => {
    this.depth += 1;
  };

  readonly endGesture = (): void => {
    this.depth -= 1;
    if (this.depth === 0 && this.pending) this.history += 1;
    if (this.depth === 0) this.pending = false;
  };

  readonly select = (id: string): void => {
    this.selected = [id];
  };

  readonly toggleSelect = (id: string): void => {
    this.selected = [...this.selected, id];
  };

  readonly clearSelected = (): void => {
    this.selected = [];
  };

  private fresh(): string {
    this.count += 1;
    return `00000000-0000-4000-a000-${String(this.count).padStart(12, '0')}`;
  }

  private record(): void {
    if (this.depth > 0) this.pending = true;
    else this.history += 1;
  }
}

function setup(): { store: FakeStore; env: IntentEnv; clip: { text: string } } {
  const store = new FakeStore(automation([start('a'), note('a', 'b'), note('b', 'c'), note('c')]));
  const clip = { text: '' };
  const clipboard: ClipboardPort = {
    read: () => Promise.resolve(clip.text),
    write: (text) => {
      clip.text = text;
      return Promise.resolve();
    },
  };
  let count = 0;
  const newId = (): string => {
    count += 1;
    return `00000000-0000-4000-9000-${String(count).padStart(12, '0')}`;
  };
  return {
    store,
    clip,
    env: {
      store,
      clipboard,
      runtime: {
        newId,
        density: 'touch',
        direction: 'ltr',
        check,
        kinds: NODE_REGISTRY,
        sizes: new Map(),
      },
    },
  };
}

async function run(intent: GraphIntent, env: IntentEnv): Promise<IntentOutcome> {
  return applyGraphIntent(intent, env);
}

const end = (key: string, handle: string): EdgeEndRequest => ({ nodeId: idOf(key), handle });

describe('applyGraphIntent', () => {
  it.each<readonly [string, GraphIntent]>([
    [
      'insert',
      {
        type: 'insert',
        request: { kind: 'flow.wait', after: { nodeId: idOf('a'), port: 'next' } },
      },
    ],
    ['connect', { type: 'connect', request: { from: end('a', 'x:next'), to: end('c', 'x:in') } }],
    ['disconnect', { type: 'disconnect', request: { kind: 'exec', from: end('b', 'x:next') } }],
    ['wrap', { type: 'wrap', request: { ids: [idOf('b')], wrapper: 'if' } }],
    [
      'move',
      { type: 'move', request: { kind: 'drag', moves: [{ id: idOf('c'), x: 700, y: 20 }] } },
    ],
    ['tidy', { type: 'tidy' }],
    ['delete', { type: 'delete', request: { ids: [idOf('b')] } }],
    ['delete owned', { type: 'delete', request: { ids: [idOf('b')], mode: 'owned' } }],
  ])('commits %s as exactly one history step', async (_name, intent) => {
    const { store, env } = setup();
    store.editLayout((layout) => ({
      ...layout,
      nodes: { ...layout.nodes, [idOf('c')]: { x: 5, y: 2000 } },
    }));
    store.history = 0;
    const outcome = await run(intent, env);
    expect(outcome.ok).toBe(true);
    expect(outcome.ok && outcome.changed).toBe(true);
    expect(store.history).toBe(1);
  });

  it('commits the program and layout change of an insert as one step and selects the new node', async () => {
    const { store, env } = setup();
    const outcome = await run(
      {
        type: 'insert',
        request: { kind: 'flow.wait', after: { nodeId: idOf('a'), port: 'next' } },
      },
      env,
    );
    const state = store.state.get();
    const added = state.program.nodes.find((node) => node.kind === 'flow.wait');
    expect(store.history).toBe(1);
    expect(state.layout.nodes[added?.id ?? '']).toBeDefined();
    expect(state.selection.ids).toEqual([added?.id]);
    expect(outcome.ok && outcome.announcement).toBe('Added Wait after Activity feed note.');
  });

  it('does not touch the history when an intent is refused or changes nothing', async () => {
    const { store, env } = setup();
    const refused = await run({ type: 'delete', request: { ids: [idOf('start')] } }, env);
    expect(refused.ok).toBe(false);
    expect(refused.ok ? '' : refused.toast).toBe(refused.ok ? '' : refused.reason);
    const same = store.state.get().layout.nodes[idOf('b')];
    const moved = await run(
      {
        type: 'move',
        request: { kind: 'drag', moves: [{ id: idOf('b'), x: same?.x ?? 0, y: same?.y ?? 0 }] },
      },
      env,
    );
    expect(moved.ok && moved.changed).toBe(false);
    expect(store.history).toBe(0);
  });

  it('copies, cuts, pastes and duplicates through the clipboard port', async () => {
    const { store, env, clip } = setup();
    store.select(idOf('b'));
    const copied = await run({ type: 'copy' }, env);
    expect(copied.ok && copied.announcement).toBe(
      'Copied 1 step. 1 wire to steps outside stayed behind.',
    );
    expect(store.history).toBe(0);
    expect(clip.text).toContain('smarteverything.automation-graph');
    const pasted = await run({ type: 'paste', at: { x: 40, y: 40 } }, env);
    expect(pasted.ok && pasted.announcement).toBe('Pasted 1 step.');
    expect(store.history).toBe(1);
    store.select(idOf('c'));
    const cut = await run({ type: 'cut' }, env);
    expect(cut.ok && cut.announcement).toBe('Cut 1 step.');
    expect(store.history).toBe(2);
    expect(store.state.get().program.nodes.some((node) => node.key === 'c')).toBe(false);
    store.select(idOf('a'));
    await run({ type: 'duplicate' }, env);
    expect(store.history).toBe(3);
    clip.text = 'plain words';
    const refused = await run({ type: 'paste' }, env);
    expect(refused.ok).toBe(false);
    expect(store.history).toBe(3);
  });
});

describe('parseGraphIntent', () => {
  it('accepts a known intent and rejects anything outside the contract', () => {
    expect(parseGraphIntent({ type: 'tidy' })).toEqual({ type: 'tidy' });
    expect(() => parseGraphIntent({ type: 'tidy', extra: true })).toThrow(InvalidGraphIntentError);
    expect(() => parseGraphIntent({ type: 'delete', request: { ids: [] } })).toThrow(
      InvalidGraphIntentError,
    );
    expect(() => parseGraphIntent('delete')).toThrow(InvalidGraphIntentError);
  });
});
