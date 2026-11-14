import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { FolderPickerProps } from './folder-picker';

const computerPicker = vi.fn((_props: FolderPickerProps): ReactNode => 'computer picker');

vi.mock('../../../design/platform', () => ({ useIdiom: (): string => 'pointer' }));
vi.mock('../../../components/dialog-frame', () => ({
  DialogFrame: ({ children }: { readonly children: ReactNode }): ReactNode => children,
}));
vi.mock('../../../components/bottom-sheet', () => ({ BottomSheet: (): null => null }));
vi.mock('./folder-picker', () => ({ FolderPicker: computerPicker }));

const { FolderPickerSheet } = await import('./folder-picker-sheet');

describe('folder picker sheet', () => {
  it('browses the named computer', () => {
    const html = renderToStaticMarkup(
      createElement(FolderPickerSheet, {
        open: true,
        mode: 'file',
        deviceId: 'laptop',
        onClose: () => undefined,
      }),
    );
    expect(html).toBe('computer picker');
    expect(computerPicker.mock.calls[0]?.[0]).toMatchObject({
      deviceId: 'laptop',
      mode: 'file',
      start: null,
    });
  });

  it('closes the sheet and hands over the chosen folder', () => {
    computerPicker.mockClear();
    const onClose = vi.fn();
    const onChoose = vi.fn();
    renderToStaticMarkup(
      createElement(FolderPickerSheet, {
        open: true,
        mode: 'folder',
        deviceId: 'laptop',
        start: '/home/me',
        onClose,
        onChoose,
      }),
    );
    computerPicker.mock.calls[0]?.[0].onChoose?.('/home/me/Projects');
    expect(onClose).toHaveBeenCalledOnce();
    expect(onChoose).toHaveBeenCalledWith('/home/me/Projects');
  });
});
