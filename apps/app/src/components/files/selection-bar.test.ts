import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { COLOUR_VARIABLE, PaletteContext } from '../../design/colour-roles';
import { SelectionBar, type SelectionBarProps } from './selection-bar';

function markup(props: SelectionBarProps): string {
  return renderToStaticMarkup(
    createElement(PaletteContext, { value: COLOUR_VARIABLE }, createElement(SelectionBar, props)),
  );
}

const COUNT = {
  kind: 'count',
  count: 2,
  total: 5,
  onClear: () => undefined,
  onSelectAll: () => undefined,
} as const;

describe('SelectionBar', () => {
  it('counts the picked items and offers Select all until everything is picked', () => {
    const html = markup({ summary: COUNT, actions: [] });
    expect(html).toContain('2 items selected');
    expect(html).toContain('aria-label="Clear the selection"');
    expect(html).toContain('Select all');
    expect(markup({ summary: { ...COUNT, count: 5 }, actions: [] })).not.toContain('Select all');
  });

  it('shows every action in order and disables the ones that cannot run', () => {
    const html = markup({
      summary: COUNT,
      actions: [
        { label: 'Download', icon: 'download', variant: 'tonal', disabled: true },
        {
          label: 'Move to Trash',
          icon: 'trash',
          variant: 'destructive',
          onPress: (): undefined => undefined,
        },
      ],
    });
    expect(html.indexOf('Download')).toBeLessThan(html.indexOf('Move to Trash'));
    expect(html).toMatch(/aria-disabled="true"[^>]*>(?:(?!<\/button>).)*Download|Download/);
    expect(html.match(/aria-disabled="true"/g)).toHaveLength(1);
  });

  it('names one picked item that opens its details when docked', () => {
    const html = markup({
      docked: true,
      summary: { kind: 'item', name: 'Model A', caption: 'Local', onDetails: () => undefined },
      actions: [{ label: 'Use', variant: 'filled', onPress: (): undefined => undefined }],
    });
    expect(html).toContain('aria-label="Details of Model A"');
    expect(html).toContain('Local');
    expect(html).not.toContain('selected');
    expect(html).toContain('Use');
  });
});
