import * as reducer from '@smarteverything/flow/ops/reducer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DocumentStore } from './document-store';
import { automation, step } from './editor-fixtures';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('an inverse that no longer applies', () => {
  it('reports the refusal and forgets the history', () => {
    const store = new DocumentStore(automation([step('a'), step('b')]));
    store.apply([{ op: 'remove', key: 'a' }]);
    store.undo();
    store.apply([{ op: 'remove', key: 'b' }]);
    vi.spyOn(reducer, 'applyPatch').mockReturnValue({
      ok: false,
      code: 'unknown_key',
      reason: 'gone',
      opIndex: 0,
    });
    store.undo();
    expect(store.state.get()).toMatchObject({
      canUndo: false,
      canRedo: false,
      refusal: { code: 'unknown_key', reason: 'gone', opIndex: 0 },
    });
  });
});
