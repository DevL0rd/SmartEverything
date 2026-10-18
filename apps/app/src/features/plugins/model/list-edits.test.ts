import { describe, expect, it } from 'vitest';
import { ListEdits, withToggled, without } from './list-edits';

describe('ListEdits', () => {
  it('keeps both picks when two arrive before the server answers', () => {
    const edits = new ListEdits();
    const server = ['a'];
    const first = edits.begin(server, (items) => withToggled(items, 'b'));
    const second = edits.begin(server, (items) => withToggled(items, 'c'));
    expect(first).toEqual(['a', 'b']);
    expect(second).toEqual(['a', 'b', 'c']);
  });

  it('builds on the server list again once the server has caught up', () => {
    const edits = new ListEdits();
    edits.begin(['a'], (items) => withToggled(items, 'b'));
    edits.land();
    expect(edits.catchUp()).toBe(true);
    expect(edits.begin(['a', 'b', 'x'], (items) => without(items, 'x'))).toEqual(['a', 'b']);
  });

  it('does not drop the pending list while a save is still in flight', () => {
    const edits = new ListEdits();
    edits.begin(['a'], (items) => withToggled(items, 'b'));
    edits.begin(['a'], (items) => withToggled(items, 'c'));
    edits.land();
    expect(edits.catchUp()).toBe(false);
    edits.land();
    expect(edits.catchUp()).toBe(true);
  });

  it('forgets the pending list when a save fails', () => {
    const edits = new ListEdits();
    edits.begin(['a'], (items) => withToggled(items, 'b'));
    edits.fail();
    expect(edits.begin(['a'], (items) => withToggled(items, 'z'))).toEqual(['a', 'z']);
  });
});

describe('list changes', () => {
  it('toggles an id in and out', () => {
    expect(withToggled(['a'], 'b')).toEqual(['a', 'b']);
    expect(withToggled(['a', 'b'], 'b')).toEqual(['a']);
  });
});
