import { describe, expect, it } from 'vitest';
import { nodeEditStage } from './node-edit-stage';

describe('nodeEditStage', () => {
  it('shows the loading page until the node arrived', () => {
    expect(nodeEditStage(undefined)).toEqual({ kind: 'loading' });
  });

  it('opens the editor for a node the person may change', () => {
    const detail = { editable: true, id: 'fn-1' };
    expect(nodeEditStage(detail)).toEqual({ kind: 'editing', detail });
  });

  it('shows the read only page for a node the person may not change', () => {
    expect(nodeEditStage({ editable: false })).toEqual({ kind: 'read-only' });
  });
});
