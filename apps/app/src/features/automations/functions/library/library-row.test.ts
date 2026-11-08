import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import type { ListRowProps } from '../../../../components/list-row';
import type { LibraryRow } from './library-model';
import { LibraryRowView } from './library-row';

vi.mock('../../../../components/list-row', () => ({
  ListRow: ({ label, title, wrapTitle, wrapSubtitle }: ListRowProps): ReactNode =>
    createElement(
      'button',
      { 'aria-label': label, 'data-title-wrap': wrapTitle, 'data-subtitle-wrap': wrapSubtitle },
      title,
    ),
}));

it('allows a long node name and interface to wrap inside its existing row', () => {
  const row: LibraryRow = {
    id: 'fixture',
    name: 'Check whether the hallway needs additional light before the evening routine',
    icon: null,
    category: 'Lighting',
    kindLabel: 'Step node',
    interfaceLine: 'in: lights, step · out: level',
    usersLabel: 'Used in 2 places',
    versionLabel: 'Version 4',
    needsMapping: false,
    section: 'mine',
  };
  const markup = renderToStaticMarkup(
    createElement(LibraryRowView, { row, onOpen: (): void => undefined }),
  );
  expect(markup).toContain('data-title-wrap="true" data-subtitle-wrap="true"');
  expect(markup).toContain(`>${row.name}</button>`);
});
