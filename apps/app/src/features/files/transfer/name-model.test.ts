import { describe, expect, it } from 'vitest';
import { freeNameOf, nameProblemOf, nameReadyOf } from './name-model';

const taken = new Set(['notes.txt', 'Projects', 'New folder']);

describe('names', () => {
  it('refuses slashes, dot names and names already taken, but not the current name', () => {
    expect(nameProblemOf('a/b', null, taken)).toBe('A name can’t contain a slash.');
    expect(nameProblemOf('..', null, taken)).toBe('That name isn’t allowed.');
    expect(nameProblemOf('Projects', null, taken)).toBe('Something here already has that name.');
    expect(nameProblemOf('notes.txt', 'notes.txt', taken)).toBeNull();
    expect(nameReadyOf('   ', null, taken)).toBe(false);
  });

  it('needs a rename to change the name', () => {
    expect(nameReadyOf('notes.txt', 'notes.txt', taken)).toBe(false);
    expect(nameReadyOf(' todo.txt ', 'notes.txt', taken)).toBe(true);
  });

  it('accepts the suggested name for a new item when nothing has it', () => {
    const suggested = freeNameOf('New folder', taken);
    expect(suggested).toBe('New folder 2');
    expect(nameReadyOf(suggested, null, taken)).toBe(true);
    expect(nameReadyOf('New folder', null, new Set())).toBe(true);
    expect(nameReadyOf('New folder', null, taken)).toBe(false);
  });

  it('suggests the base name, then the next free number', () => {
    expect(freeNameOf('New folder', new Set())).toBe('New folder');
    expect(freeNameOf('New folder', new Set(['New folder', 'New folder 2']))).toBe('New folder 3');
  });
});
