import { describe, expect, it } from 'vitest';
import { glyphOf, selectionLabel } from './file-kind';

describe('glyphOf', () => {
  it('picks the icon from the kind and the extension', () => {
    expect(glyphOf({ kind: 'folder', name: 'a' })).toBe('folder');
    expect(glyphOf({ kind: 'link', name: 'a' })).toBe('link');
    expect(glyphOf({ kind: 'file', name: 'Photo.JPG' })).toBe('image');
    expect(glyphOf({ kind: 'file', name: 'png' })).toBe('fileText');
    expect(glyphOf({ kind: 'file', name: 'notes.txt' })).toBe('fileText');
    expect(glyphOf({ kind: 'other', name: 'socket' })).toBe('fileText');
  });
});

describe('selectionLabel', () => {
  it('says how many are selected', () => {
    expect(selectionLabel(1)).toBe('1 item selected');
    expect(selectionLabel(3)).toBe('3 items selected');
  });
});
