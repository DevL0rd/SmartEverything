import { describe, expect, it } from 'vitest';
import { editorKeyOf, type TextEditRequest } from './text-edit-sheet';

function request(title: string, initial: string, id?: string): TextEditRequest {
  return {
    ...(id === undefined ? {} : { id }),
    title,
    label: 'Room name',
    initial,
    placeholder: 'Room name',
    confirmLabel: 'Save',
    maxLength: 60,
    save: () => Promise.resolve(),
  };
}

describe('editorKeyOf', () => {
  it('keeps the key when only the live initial value changes mid-save', () => {
    expect(editorKeyOf(request('Home name', 'Old'))).toBe(editorKeyOf(request('Home name', 'New')));
  });

  it('keeps the key across fresh request objects for the same edit', () => {
    expect(editorKeyOf(request('Rename room', 'Kitchen', 'r1'))).toBe(
      editorKeyOf(request('Rename room', 'Kitchen', 'r1')),
    );
  });

  it('uses another key for another entity with the same title', () => {
    expect(editorKeyOf(request('Rename room', 'Kitchen', 'r1'))).not.toBe(
      editorKeyOf(request('Rename room', 'Kitchen', 'r2')),
    );
  });

  it('falls back to the title when there is no id', () => {
    expect(editorKeyOf(request('Rename room', 'Kitchen'))).not.toBe(
      editorKeyOf(request('Add a room', 'Kitchen')),
    );
  });
});
