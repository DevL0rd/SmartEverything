import { describe, expect, it } from 'vitest';
import { DRIVE_FOLDER_COLOURS } from '@smarteverything/domain';
import {
  BADGE_MIN_GLYPH,
  FOLDER_COLOUR_ROLE,
  colourChoicesOf,
  folderColourRoleOf,
  folderGlyphOf,
} from './folder-glyph-model';

describe('folder glyph', () => {
  it('tints the folder with the viewer’s colour and keeps the accent without one', () => {
    expect(folderGlyphOf({ colour: null, iconHint: false }, null)).toEqual({
      colour: 'primary',
      box: 20,
      badge: null,
      label: 'Folder',
    });
    expect(folderGlyphOf({ colour: 'viz-3', iconHint: false }, 'l')).toMatchObject({
      colour: 'viz-3',
      box: 48,
      label: 'Lavender folder',
    });
    expect(folderColourRoleOf('viz-7')).toBe('viz-blue');
    expect(folderColourRoleOf('viz-8')).toBe('viz-magenta');
  });

  it('puts the icon badge at half the glyph size and only from 20 px up', () => {
    expect(BADGE_MIN_GLYPH).toBe(20);
    expect(folderGlyphOf({ colour: null, iconHint: true }, null)).toMatchObject({
      badge: 10,
      label: 'Folder with its own icon',
    });
    expect(folderGlyphOf({ colour: 'viz-1', iconHint: true }, 'l').badge).toBe(24);
    expect(folderGlyphOf({ colour: null, iconHint: true }, 's').badge).toBe(14);
    expect(folderGlyphOf({ colour: null, iconHint: false }, 'm').badge).toBeNull();
  });

  it('offers every folder colour once, in order, marking the chosen one', () => {
    const choices = colourChoicesOf('viz-2');
    expect(choices.map((choice) => choice.colour)).toEqual([...DRIVE_FOLDER_COLOURS]);
    expect(choices.filter((choice) => choice.selected).map((choice) => choice.colour)).toEqual([
      'viz-2',
    ]);
    expect(new Set(choices.map((choice) => choice.label)).size).toBe(choices.length);
    expect(colourChoicesOf(null).some((choice) => choice.selected)).toBe(false);
    expect(Object.keys(FOLDER_COLOUR_ROLE)).toEqual([...DRIVE_FOLDER_COLOURS]);
  });
});
