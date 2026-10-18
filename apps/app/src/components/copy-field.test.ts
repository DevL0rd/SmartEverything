import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

const log = vi.hoisted(() => ({
  presses: new Array<() => void>(),
  notices: new Array<{ readonly message: string }>(),
}));

vi.mock('expo-clipboard', () => ({
  setStringAsync: (): Promise<boolean> => Promise.resolve(true),
}));

vi.mock('./toast-store', () => ({
  notify: (notice: { readonly message: string }): void => {
    log.notices.push(notice);
  },
}));

vi.mock('./icon-button', () => ({
  IconButton: (props: { readonly onPress: () => void }): null => {
    log.presses.push(props.onPress);
    return null;
  },
}));

vi.mock('./text', () => ({ Text: (): null => null }));

const { onLocalCopy } = await import('./local-copies');
const { CopyField } = await import('./copy-field');
const { CopyButton } = await import('./copy-button');

describe('copy toasts', () => {
  it('keeps the case of a copy field label in the toast', async () => {
    renderToStaticMarkup(createElement(CopyField, { label: 'Device id', value: 'abc' }));
    log.presses.at(-1)?.();
    await vi.waitFor(() => {
      expect(log.notices.at(-1)?.message).toBe('Device id copied');
    });
  });

  it('uses the explicit subject of a copy button', async () => {
    renderToStaticMarkup(
      createElement(CopyButton, { value: 'x', label: 'Copy the link', what: 'Link' }),
    );
    log.presses.at(-1)?.();
    await vi.waitFor(() => {
      expect(log.notices.at(-1)?.message).toBe('Link copied');
    });
  });

  it('tells the shared clipboard what was copied', async () => {
    const copied: string[] = [];
    const stop = onLocalCopy((text) => copied.push(text));
    renderToStaticMarkup(createElement(CopyField, { label: 'Device id', value: 'abc' }));
    log.presses.at(-1)?.();
    await vi.waitFor(() => {
      expect(copied).toEqual(['abc']);
    });
    stop();
  });
});
