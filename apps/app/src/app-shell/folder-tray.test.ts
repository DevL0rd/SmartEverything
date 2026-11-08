import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { BottomSheetProps } from '../components/bottom-sheet';
import { FolderTray } from './folder-tray';
import type { NavFolderView } from './nav-model';

vi.mock('react-native', () => ({
  View: ({ children }: { readonly children: ReactNode }): ReactNode => children,
}));
vi.mock('../components/bottom-sheet', () => ({
  BottomSheet: ({ children, compact, title, detents }: BottomSheetProps): ReactNode =>
    createElement(
      'section',
      { 'data-compact': compact, 'data-detent': detents[0] },
      title,
      children,
    ),
}));
vi.mock('../components/text', () => ({
  Text: ({ children }: { readonly children: ReactNode }): ReactNode => children,
}));
vi.mock('./nav-row', () => ({ NavRow: (): null => null }));

describe('Folder tray', () => {
  it('fits the heading and empty row in the shared compact sheet', () => {
    const folder: NavFolderView = {
      kind: 'folder',
      key: 'fixture-folder',
      title: 'Fixture folder',
      icon: 'folder',
      items: [],
      active: false,
      open: true,
    };
    const none = (): void => undefined;
    const markup = renderToStaticMarkup(
      createElement(FolderTray, { folder, go: none, intent: none, onClose: none }),
    );
    expect(markup).toBe(
      '<section data-compact="true" data-detent="fit">Fixture folderThis folder is empty</section>',
    );
  });
});
