import {
  HOME_MAP,
  applyHomeMapEdits,
  type HomeMap,
  type HomeMapActor,
  type HomeMapEditBatch,
  type HomeMapEditResultAnswer,
  type HomeMapOp,
  type HomeMapRevisionEntry,
} from '@smarteverything/domain';
import { describe, expect, it, vi } from 'vitest';
import {
  HomeMapEditor,
  OFFLINE_TEXT,
  conflictText,
  editorNotice,
  saveText,
  type HomeMapEditorApi,
} from './edits';

const ACTOR: HomeMapActor = 'profile:alice';
const AT = '2026-10-25T11:00:00.000Z';
const REACHABLE = new Error('The server could not be reached');

const floor = {
  id: 'floor-1',
  name: 'Ground',
  level: 0,
  elevation: 0,
  ceilingHeight: 2.6,
  rooms: [],
  walls: [],
  openings: [],
  placements: [],
  annotations: [],
  objects: [
    {
      id: 'sofa',
      modelId: 'cat.sofa.two_seat',
      finish: null,
      params: {},
      at: { x: 1, y: 1 },
      rotation: 0,
      elevation: 0,
      label: 'Sofa',
      locked: false,
      origin: { kind: 'hand' },
    },
  ],
};

const mapAt = (revision: number): HomeMap =>
  HOME_MAP.parse({
    id: 'home',
    schemaVersion: 1,
    revision,
    name: 'House',
    north: 0,
    updatedAt: AT,
    sources: [],
    notices: [],
    floors: [floor],
  });

const rename = (label: string): HomeMapOp => ({
  op: 'update',
  kind: 'object',
  floorId: 'floor-1',
  id: 'sofa',
  patch: { label },
});

const removeSofa: HomeMapOp = { op: 'remove', kind: 'object', floorId: 'floor-1', id: 'sofa' };

interface Gate {
  readonly open: () => void;
  readonly closed: Promise<void>;
}

function gate(): Gate {
  let open = (): void => undefined;
  const closed = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { open, closed };
}

type Failure = 'none' | 'lost_after_apply' | 'lost_before_apply';

interface Harness {
  readonly editor: HomeMapEditor;
  readonly sent: HomeMapEditBatch[];
  readonly refetches: () => number;
  readonly cache: () => HomeMap | undefined;
  readonly server: () => HomeMap;
  readonly state: { failure: Failure; revisionsDown: boolean };
  readonly hold: { edit: Promise<void> | null; before: (() => void) | null };
  readonly others: (ops: readonly HomeMapOp[]) => void;
}

function harness(start = mapAt(5)): Harness {
  let server = start;
  let cached: HomeMap | undefined = start;
  let refetched = 0;
  const sent: HomeMapEditBatch[] = [];
  const log: HomeMapRevisionEntry[] = [];
  const undone: HomeMapRevisionEntry[] = [];
  const state: { failure: Failure; revisionsDown: boolean } = {
    failure: 'none',
    revisionsDown: false,
  };
  const hold: { edit: Promise<void> | null; before: (() => void) | null } = {
    edit: null,
    before: null,
  };
  const run = (actor: HomeMapActor, ops: readonly HomeMapOp[]): HomeMapEditResultAnswer => {
    const result = applyHomeMapEdits(server, ops, { actor, at: AT });
    if (result.applied.length > 0) {
      server = result.map;
      log.push({
        revision: server.revision,
        ops: [...result.applied],
        inverse: [...result.inverse],
        actor,
        at: AT,
      });
    }
    return { revision: server.revision, conflicts: [...result.conflicts] };
  };
  const step = (
    from: HomeMapRevisionEntry[],
    to: HomeMapRevisionEntry[],
    inverse: boolean,
  ): Promise<HomeMapEditResultAnswer> => {
    const entry = from.pop();
    if (entry === undefined) return Promise.resolve({ revision: server.revision, conflicts: [] });
    to.push(entry);
    return Promise.resolve(run(ACTOR, inverse ? entry.inverse : entry.ops));
  };
  const api: HomeMapEditorApi = {
    edit: async (batch): Promise<HomeMapEditResultAnswer> => {
      sent.push(batch);
      await hold.edit;
      hold.before?.();
      if (state.failure === 'lost_before_apply') throw REACHABLE;
      const answer = run(ACTOR, batch.ops);
      if (state.failure === 'lost_after_apply') throw REACHABLE;
      return answer;
    },
    undo: () =>
      step(
        log.filter((entry) => entry.actor === ACTOR && !undone.includes(entry)),
        undone,
        true,
      ),
    redo: () => step(undone, [], false),
    revisions: (actor, after): Promise<readonly HomeMapRevisionEntry[]> =>
      state.revisionsDown
        ? Promise.reject(REACHABLE)
        : Promise.resolve(log.filter((entry) => entry.actor === actor && entry.revision > after)),
  };
  const editor = new HomeMapEditor({
    actor: ACTOR,
    api,
    now: (): string => AT,
    read: (): HomeMap | undefined => cached,
    write: (map): void => {
      cached = map;
    },
    refetch: (): Promise<HomeMap> => {
      refetched += 1;
      cached = server;
      return Promise.resolve(server);
    },
  });
  editor.setConnected(true);
  return {
    editor,
    sent,
    refetches: (): number => refetched,
    cache: (): HomeMap | undefined => cached,
    server: (): HomeMap => server,
    state,
    hold,
    others: (ops): void => {
      run('profile:bob', ops);
    },
  };
}

describe('optimistic map edits while connected', () => {
  it('shows the change at once and keeps it when the hub agrees', async () => {
    const test = harness();
    const closing = gate();
    test.hold.edit = closing.closed;
    const saving = test.editor.edit([rename('Big sofa')]);
    await Promise.resolve();
    expect(test.cache()?.revision).toBe(6);
    expect(test.editor.read().status).toStrictEqual({ kind: 'saving' });
    closing.open();
    expect(await saving).toStrictEqual({ kind: 'saved' });
    expect(test.sent).toStrictEqual([{ baseRevision: 5, ops: [rename('Big sofa')] }]);
    expect(test.refetches()).toBe(0);
    expect(test.editor.read().canUndo).toBe(true);
  });

  it('refetches the truth when someone else changed the map first', async () => {
    const test = harness();
    test.hold.before = (): void => {
      test.others([rename('Elsewhere')]);
    };
    expect(await test.editor.edit([rename('Mine')])).toStrictEqual({ kind: 'saved' });
    expect(test.refetches()).toBe(1);
    expect(test.cache()?.revision).toBe(7);
    expect(test.cache()?.floors[0]?.objects[0]?.label).toBe('Mine');
  });

  it('drops an edit of something that is gone without asking the hub', async () => {
    const test = harness();
    await test.editor.edit([removeSofa]);
    const status = await test.editor.edit([rename('Again')]);
    expect(status).toStrictEqual({ kind: 'conflicts', messages: ['Someone removed this item'] });
    expect(test.sent).toHaveLength(1);
  });

  it('reports the operations the hub dropped and shows the hub version', async () => {
    const test = harness();
    test.hold.before = (): void => {
      test.others([removeSofa]);
    };
    const status = await test.editor.edit([rename('Late')]);
    expect(status).toStrictEqual({ kind: 'conflicts', messages: ['Someone removed this Sofa'] });
    expect(test.refetches()).toBe(1);
    expect(test.cache()?.floors[0]?.objects).toStrictEqual([]);
  });
});

describe('connectivity', () => {
  it('refuses an edit while offline and never sends it later', async () => {
    const test = harness();
    test.editor.setConnected(false);
    await test.editor.edit([rename('Offline')]);
    test.editor.setConnected(true);
    await test.editor.edit([]);
    expect(test.sent).toStrictEqual([]);
    expect(test.cache()?.revision).toBe(5);
    expect(editorNotice({ ...test.editor.read(), connected: false })).toBe(OFFLINE_TEXT);
  });

  it('sends a second edit only after the first, built on the first', async () => {
    const test = harness();
    await Promise.all([test.editor.edit([rename('One')]), test.editor.edit([rename('Two')])]);
    expect(test.sent.map((batch) => batch.baseRevision)).toStrictEqual([5, 6]);
    expect(test.server().revision).toBe(7);
  });

  it('drops a waiting edit when the connection is lost before its turn', async () => {
    const test = harness();
    const closing = gate();
    test.hold.edit = closing.closed;
    const first = test.editor.edit([rename('One')]);
    const second = test.editor.edit([rename('Two')]);
    await vi.waitFor(() => {
      expect(test.sent).toHaveLength(1);
    });
    test.editor.setConnected(false);
    closing.open();
    await Promise.all([first, second]);
    expect(test.sent).toHaveLength(1);
  });
});

describe('an answer that was lost is never resent', () => {
  it('refetches by revision and tells that the change landed', async () => {
    const test = harness();
    test.state.failure = 'lost_after_apply';
    expect(await test.editor.edit([rename('Landed')])).toStrictEqual({ kind: 'saved' });
    expect(test.sent).toHaveLength(1);
    expect(test.refetches()).toBe(1);
    expect(test.cache()?.revision).toBe(6);
  });

  it('tells that the change did not save when the hub never applied it', async () => {
    const test = harness();
    test.state.failure = 'lost_before_apply';
    const status = await test.editor.edit([rename('Lost')]);
    expect(status).toStrictEqual({ kind: 'not_saved' });
    expect(saveText(status)).toBe('Your last change did not save: try again');
    expect(test.sent).toHaveLength(1);
    expect(test.cache()?.revision).toBe(5);
    expect(test.editor.read().canUndo).toBe(false);
  });

  it('checks again when connected again if the check itself could not run', async () => {
    const test = harness();
    test.state.failure = 'lost_after_apply';
    test.state.revisionsDown = true;
    expect(await test.editor.edit([rename('Unsure')])).toStrictEqual({ kind: 'unconfirmed' });
    test.state.revisionsDown = false;
    test.editor.setConnected(false);
    test.editor.setConnected(true);
    await test.editor.edit([]);
    expect(test.editor.read().status).toStrictEqual({ kind: 'saved' });
    expect(test.sent).toHaveLength(1);
    expect(test.editor.read().canUndo).toBe(true);
  });
});

describe('undo and redo', () => {
  it('ask the hub, show what it answers and keep the counts', async () => {
    const test = harness();
    await test.editor.edit([rename('One')]);
    expect(test.editor.read()).toMatchObject({ canUndo: true, canRedo: false });
    await test.editor.undo();
    expect(test.cache()?.floors[0]?.objects[0]?.label).toBe('Sofa');
    expect(test.editor.read()).toMatchObject({ canUndo: false, canRedo: true });
    await test.editor.redo();
    expect(test.cache()?.floors[0]?.objects[0]?.label).toBe('One');
    expect(test.editor.read()).toMatchObject({ canUndo: true, canRedo: false });
    expect(test.sent).toHaveLength(1);
  });

  it('are not sent while offline', async () => {
    const test = harness();
    await test.editor.edit([rename('One')]);
    test.editor.setConnected(false);
    await test.editor.undo();
    expect(test.server().floors[0]?.objects[0]?.label).toBe('One');
  });
});

describe('words for the editor', () => {
  it('says what happened in plain words', () => {
    expect(saveText({ kind: 'idle' })).toBeNull();
    expect(saveText({ kind: 'saved' })).toBe('Your last change was saved');
    expect(
      conflictText({ index: 0, op: 'update', kind: 'wall', id: 'w', reason: 'locked' }, undefined),
    ).toBe('This wall is locked');
    expect(editorNotice(harness().editor.read())).toBeNull();
  });
});
