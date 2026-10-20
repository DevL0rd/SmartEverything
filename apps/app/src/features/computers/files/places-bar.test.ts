import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { FilePlaces } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { COLOUR_VARIABLE, PaletteContext } from '../../../design/colour-roles';
import { PlacesBar } from './places-bar';

const PLACES: FilePlaces = {
  home: '/home/dana',
  places: [
    { label: 'Home', path: '/home/dana', kind: 'home' },
    { label: 'Downloads', path: '/home/dana/Downloads', kind: 'folder' },
    { label: 'Desktop', path: '/home/dana/Desktop', kind: 'folder' },
    { label: 'Documents', path: '/home/dana/Documents', kind: 'folder' },
    { label: 'Computer', path: '/', kind: 'root' },
    { label: 'Backup', path: '/mnt/backup', kind: 'drive' },
  ],
};

function markup(here: string): string {
  return renderToStaticMarkup(
    createElement(
      PaletteContext,
      { value: COLOUR_VARIABLE },
      createElement(PlacesBar, { places: PLACES, here, onGo: () => undefined }),
    ),
  );
}

describe('quick places bar', () => {
  it('shows every place as one chip in a single horizontally scrolling row', () => {
    const html = markup('/home/dana');
    for (const place of PLACES.places) expect(html).toContain(`Go to ${place.label}`);
    expect(html.match(/aria-label="Go to /g)).toHaveLength(PLACES.places.length);
    expect(html).toMatch(/r-overflowX-\w+/);
  });

  it('marks only the chip of the folder being browsed as selected', () => {
    const html = markup('/home/dana/Downloads');
    expect(html.match(/<svg[^>]*stroke="--color-primary"/g)).toHaveLength(1);
  });
});
