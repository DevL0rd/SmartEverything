import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { COLOUR_VARIABLE, PaletteContext } from '../../design/colour-roles';
import { EntryRow, type EntryRowProps } from './entry-row';

const BASE: EntryRowProps = {
  name: 'report.pdf',
  kind: 'file',
  caption: '12 KB · today',
  size: 12_288,
  modifiedAt: '2026-10-15T10:00:00Z',
  wide: false,
  selecting: false,
  selected: false,
  openLabel: 'Preview report.pdf',
  menu: [{ label: 'Open', onPress: () => undefined }],
  onOpen: () => undefined,
  onSelect: () => undefined,
};

function markup(change: Partial<EntryRowProps> = {}): string {
  return renderToStaticMarkup(
    createElement(
      PaletteContext,
      { value: COLOUR_VARIABLE },
      createElement(EntryRow, { ...BASE, ...change }),
    ),
  );
}

describe('EntryRow', () => {
  it('opens the entry and offers its actions', () => {
    const html = markup();
    expect(html).toContain('aria-label="Preview report.pdf"');
    expect(html).toContain('aria-label="Actions for report.pdf"');
    expect(html).toContain('12 KB · today');
    expect(html).not.toContain('12 KB</div>');
  });

  it('turns the row into a selection toggle while selecting', () => {
    const html = markup({ selecting: true, selected: true });
    expect(html).toContain('aria-label="Select report.pdf"');
    expect(html).toContain('d="m16 9-5.5 5.5L8 12"');
    expect(html).toContain('stroke="--color-primary"');
    const open = markup({ selecting: true, selected: false });
    expect(open).not.toContain('d="m16 9-5.5 5.5L8 12"');
    expect(open).toContain('stroke="--color-on-surface-faint"');
  });

  it('shows the size and modified columns only on wide layouts, a dash for no size', () => {
    expect(markup({ wide: true })).toContain('12 KB');
    expect(markup({ wide: true, size: null, kind: 'folder' })).toContain('—');
    expect(markup({ wide: false, size: null })).not.toContain('—');
  });

  it('draws a thumbnail in place of the glyph and a star when marked', () => {
    const thumb = createElement('img', { alt: 'thumb' });
    const html = markup({ thumbnail: thumb, starred: true });
    expect(html).toContain('alt="thumb"');
    expect(html.match(/<svg/g)?.length).toBeGreaterThanOrEqual(1);
    expect(html).toContain('stroke="--color-warning"');
    expect(markup()).not.toContain('stroke="--color-warning"');
  });

  it('shows the By column only when given, and only on wide layouts', () => {
    expect(markup({ wide: true, by: 'Dana' })).toContain('Dana');
    expect(markup({ wide: true, by: null })).toContain('—');
    expect(markup({ wide: true, by: null })).toContain('—');
    expect(markup({ wide: true })).not.toContain('—');
    expect(markup({ wide: false, by: 'Dana' })).not.toContain('Dana');
  });

  it('marks the matched part of the name when a filter highlight is given', () => {
    const html = markup({ name: 'Holiday budget.pdf', nameHighlight: { start: 8, end: 11 } });
    expect(html).toMatch(/Holiday <span[^>]*>bud<\/span>get\.pdf/);
    expect(markup({ name: 'Holiday budget.pdf' })).toContain('Holiday budget.pdf');
  });
});
