import { STATIC_KIND_LOOKUP } from '@smarteverything/domain';
import * as reducer from '@smarteverything/flow/graph/ops/reducer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DocumentStore } from './document-store';
import { automation, note, start } from '../graph/graph-scene-fixtures';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('an inverse that no longer applies', () => {
  it('reports the refusal and forgets the history', () => {
    const store = new DocumentStore(
      automation([start('a'), note('a', 'b'), note('b')]),
      STATIC_KIND_LOOKUP,
    );
    store.apply([{ op: 'remove', key: 'a' }]);
    store.undo();
    store.apply([{ op: 'remove', key: 'b' }]);
    vi.spyOn(reducer, 'applyPatch').mockReturnValue({
      ok: false,
      code: 'unknown_key',
      reason: 'gone',
      opIndex: 0,
      problems: [],
    });
    store.undo();
    expect(store.state.get()).toMatchObject({
      canUndo: false,
      canRedo: false,
      refusal: { code: 'unknown_key', reason: 'gone', opIndex: 0 },
    });
  });
});
