import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { HubFolderPickerProps } from './hub-folder-picker';

const computerPicker = vi.fn((_props: object): ReactNode => 'computer picker');
const hubPicker = vi.fn((_props: HubFolderPickerProps): ReactNode => 'hub picker');

vi.mock('../../../design/platform', () => ({ useIdiom: (): string => 'pointer' }));
vi.mock('../../../components/dialog-frame', () => ({
  DialogFrame: ({ children }: { readonly children: ReactNode }): ReactNode => children,
}));
vi.mock('../../../components/bottom-sheet', () => ({ BottomSheet: (): null => null }));
vi.mock('./folder-picker', () => ({ FolderPicker: computerPicker }));
vi.mock('./hub-folder-picker', () => ({ HubFolderPicker: hubPicker }));

const { FolderPickerSheet } = await import('./folder-picker-sheet');

describe('folder picker sheet source', () => {
  it('browses the hub host folders without any computer for the hub source', () => {
    const html = renderToStaticMarkup(
      createElement(FolderPickerSheet, {
        open: true,
        mode: 'folder',
        source: { kind: 'hub' },
        start: '/volume1',
        onClose: () => undefined,
      }),
    );
    expect(html).toBe('hub picker');
    expect(computerPicker).not.toHaveBeenCalled();
    expect(hubPicker.mock.calls[0]?.[0]).toMatchObject({ start: '/volume1', compact: false });
  });

  it('browses the named computer for the computer source', () => {
    const html = renderToStaticMarkup(
      createElement(FolderPickerSheet, {
        open: true,
        mode: 'file',
        source: { kind: 'computer', deviceId: 'laptop' },
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

  it('closes the sheet and hands over the chosen hub folder', () => {
    hubPicker.mockClear();
    const onClose = vi.fn();
    const onChoose = vi.fn();
    renderToStaticMarkup(
      createElement(FolderPickerSheet, {
        open: true,
        mode: 'folder',
        source: { kind: 'hub' },
        onClose,
        onChoose,
      }),
    );
    hubPicker.mock.calls[0]?.[0].onChoose('/volume1/media');
    expect(onClose).toHaveBeenCalledOnce();
    expect(onChoose).toHaveBeenCalledWith('/volume1/media');
  });
});
