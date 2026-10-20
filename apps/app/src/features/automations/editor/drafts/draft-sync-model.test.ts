import type { AutomationProgramProblem, AutomationProgramReply } from '@smarteverything/domain';
import { ApiError, EMPTY_LAYOUT } from '@smarteverything/domain';
import { describe, expect, it, vi } from 'vitest';
import type { PatchOp } from '@smarteverything/flow/ops/schema';
import type { DraftSaveBody, RevisionRow } from '../../data/api';
import { DocumentStore } from '../../model/editor/document-store';
import { automation, idSource, step } from '../../model/editor/editor-fixtures';
import { DraftSyncModel, type SyncPorts } from './draft-sync-model';

const BASE = automation([step('a', { level: { lit: 1 } }), step('b'), step('c')]);

function reply(
  revision: number | null,
  problems: AutomationProgramProblem[] = [],
): AutomationProgramReply {
  return { ok: true, summary: 'ok', id: null, revision, problems };
}

function row(revision: number, program = BASE): RevisionRow {
  return {
    automation_id: '00000000-0000-4000-8000-000000000001',
    revision,
    definition: program,
    layout: EMPTY_LAYOUT,
    plan_hash: 'hash',
    saved_at: '2026-10-19T10:00:00.000Z',
    author: { via: 'assistant', profile_id: '00000000-0000-4000-8000-000000000002' },
  };
}

interface Rig {
  readonly store: DocumentStore;
  readonly model: DraftSyncModel;
  readonly saves: DraftSaveBody[];
  readonly release: () => void;
  readonly ports: { -readonly [K in keyof SyncPorts]: SyncPorts[K] };
}

function rig(options: { hold?: boolean } = {}): Rig {
  const store = new DocumentStore(BASE, EMPTY_LAYOUT, { newId: idSource() });
  const saves: DraftSaveBody[] = [];
  const waiting: (() => void)[] = [];
  const ports: Rig['ports'] = {
    save: async (body): Promise<AutomationProgramReply> => {
      saves.push(body);
      if (options.hold === true) await new Promise<void>((resolve) => waiting.push(resolve));
      return reply(body.expectedRevision);
    },
    discard: (): Promise<AutomationProgramReply> => Promise.resolve(reply(null)),
    publish: (expected): Promise<AutomationProgramReply> => Promise.resolve(reply(expected + 1)),
    revision: (revision): Promise<RevisionRow> => Promise.resolve(row(revision)),
    latest: (): Promise<RevisionRow> => Promise.resolve(row(8)),
  };
  const model = new DraftSyncModel(
    store,
    ports,
    { program: BASE, layout: EMPTY_LAYOUT, revision: 7 },
    true,
  );
  model.attach();
  return { store, model, saves, ports, release: () => waiting.shift()?.() };
}

const level = (value: number): PatchOp[] => [
  { op: 'set' as const, key: 'a', ports: { level: { lit: value } } },
];

describe('saving', () => {
  it('saves an edit with the revision it is based on and reports saved', async () => {
    const { store, model, saves } = rig();
    store.apply(level(5));
    await model.settle();
    expect(saves).toHaveLength(1);
    expect(saves[0]?.expectedRevision).toBe(7);
    expect(model.state.get().status).toBe('saved');
    expect(store.state.get().dirty).toBe(false);
  });

  it('keeps one request in flight and sends only the newest state after it', async () => {
    const { store, model, saves, release } = rig({ hold: true });
    store.apply(level(2));
    expect(model.state.get().status).toBe('saving');
    store.apply(level(3));
    store.apply(level(4));
    expect(saves).toHaveLength(1);
    release();
    await vi.waitFor(() => {
      expect(saves).toHaveLength(2);
    });
    release();
    await model.settle();
    expect(saves).toHaveLength(2);
    expect(saves[1]?.program).toEqual(store.state.get().program);
    expect(model.state.get().status).toBe('saved');
  });

  it('waits for the gesture to end before saving', async () => {
    const { store, model, saves } = rig();
    model.beginGesture();
    store.apply(level(2));
    store.apply(level(3));
    expect(saves).toHaveLength(0);
    expect(model.state.get().status).toBe('unsaved');
    model.endGesture();
    await model.settle();
    expect(saves).toHaveLength(1);
  });
});

describe('offline', () => {
  it('pauses while offline and saves on reconnect with the revision check', async () => {
    const { store, model, saves } = rig();
    model.setOnline(false);
    store.apply(level(9));
    await model.settle();
    expect(saves).toHaveLength(0);
    expect(model.state.get().status).toBe('offline');
    model.setOnline(true);
    await model.settle();
    expect(saves).toHaveLength(1);
    expect(saves[0]?.expectedRevision).toBe(7);
    expect(model.state.get().status).toBe('saved');
  });

  it('shows a failed save once and retries on the next change', async () => {
    const { store, model, saves, ports } = rig();
    let calls = 0;
    ports.save = (body): Promise<AutomationProgramReply> => {
      saves.push(body);
      calls += 1;
      return calls === 1
        ? Promise.reject(new Error('network down'))
        : Promise.resolve(reply(body.expectedRevision));
    };
    store.apply(level(2));
    await model.settle();
    expect(model.state.get()).toMatchObject({ status: 'failed', failure: 'network down' });
    expect(saves).toHaveLength(1);
    store.apply(level(3));
    await model.settle();
    expect(saves).toHaveLength(2);
    expect(model.state.get().status).toBe('saved');
  });
});

describe('conflict', () => {
  function conflicting(): Rig {
    const made = rig();
    made.ports.save = (body): Promise<AutomationProgramReply> => {
      made.saves.push(body);
      return body.expectedRevision === 7
        ? Promise.reject(new ApiError('conflict', 'moved'))
        : Promise.resolve(reply(body.expectedRevision));
    };
    made.ports.latest = (): Promise<RevisionRow> =>
      Promise.resolve(
        row(
          8,
          automation([step('a', { level: { lit: 1 } }), step('b', undefined, { label: 'Theirs' })]),
        ),
      );
    return made;
  }

  it('opens a conflict when the revision moved and stops saving', async () => {
    const { store, model } = conflicting();
    store.apply(level(5));
    await model.settle();
    expect(model.state.get().status).toBe('conflict');
    expect(model.state.get().conflict?.revision).toBe(8);
    expect(model.state.get().conflict?.author?.via).toBe('assistant');
  });

  it('keeps my draft on top of the new revision and reports what no longer fits', async () => {
    const { store, model, saves } = conflicting();
    store.apply(level(5));
    store.apply([{ op: 'set', key: 'c', label: 'Mine' }]);
    await model.settle();
    model.keepMine();
    await model.settle();
    const state = store.state.get();
    expect(state.program.body.nodes.map((node) => node.key)).toEqual(['a', 'b']);
    expect(state.program.body.nodes[0]?.ports?.['level']).toEqual({ lit: 5 });
    expect(state.program.body.nodes[1]?.label).toBe('Theirs');
    expect(model.state.get().notice?.dropped.map((item) => item.summary)).toEqual(['Change "c"']);
    expect(saves.at(-1)?.expectedRevision).toBe(8);
    expect(model.state.get()).toMatchObject({ status: 'saved', revision: 8, conflict: null });
  });

  it('uses theirs and discards the stale draft', async () => {
    const { store, model, ports } = conflicting();
    const discarded: number[] = [];
    ports.discard = (revision): Promise<AutomationProgramReply> => {
      discarded.push(revision);
      return Promise.resolve(reply(null));
    };
    store.apply(level(5));
    await model.settle();
    await model.useTheirs();
    expect(store.state.get().program.body.nodes.map((node) => node.label)).toEqual([
      undefined,
      'Theirs',
    ]);
    expect(discarded).toEqual([8]);
    expect(model.state.get()).toMatchObject({ status: 'saved', revision: 8 });
  });

  it('adopts a newer revision at once when there is nothing unsaved', async () => {
    const { store, model, ports } = rig();
    ports.latest = (): Promise<RevisionRow> => Promise.resolve(row(8, automation([step('z')])));
    await model.noteRemote(8);
    expect(store.state.get().program.body.nodes.map((node) => node.key)).toEqual(['z']);
    expect(model.state.get().revision).toBe(8);
  });
});

describe('publishing', () => {
  const problem = (severity: 'error' | 'warning'): AutomationProgramProblem => ({
    severity,
    code: 'x',
    message: `a ${severity}`,
  });

  it('blocks on errors and lists warnings when ready', async () => {
    const { store, model, ports } = rig();
    ports.save = (body): Promise<AutomationProgramReply> =>
      Promise.resolve(reply(body.expectedRevision, [problem('error')]));
    store.apply(level(2));
    expect(await model.prepare()).toMatchObject({ kind: 'blocked' });
    ports.save = (body): Promise<AutomationProgramReply> =>
      Promise.resolve(reply(body.expectedRevision, [problem('warning')]));
    store.apply(level(3));
    const plan = await model.prepare();
    expect(plan).toMatchObject({ kind: 'ready', current: 7, next: 8 });
    expect(plan.kind === 'ready' ? plan.notes : []).toHaveLength(1);
  });

  it('publishes the saved draft and moves the base to the new revision', async () => {
    const { store, model } = rig();
    store.apply(level(2));
    await model.prepare();
    expect(await model.publish()).toEqual({ kind: 'published', revision: 8, previous: 7 });
    expect(model.state.get().revision).toBe(8);
  });

  it('undoes a publish by restoring the previous revision as the new live one', async () => {
    const { store, model, saves } = rig();
    store.apply(level(2));
    await model.prepare();
    await model.publish();
    const outcome = await model.undoPublish(7);
    expect(outcome).toEqual({ kind: 'published', revision: 9, previous: 8 });
    expect(saves.at(-1)?.program).toEqual(BASE);
  });

  it('does not publish when the restore could not be saved', async () => {
    const { store, model, ports } = rig();
    store.apply(level(2));
    await model.prepare();
    await model.publish();
    let published = 0;
    ports.publish = (expected): Promise<AutomationProgramReply> => {
      published += 1;
      return Promise.resolve(reply(expected + 1));
    };
    model.setOnline(false);
    const outcome = await model.undoPublish(7);
    expect(outcome.kind).toBe('unavailable');
    expect(published).toBe(0);
  });
});
