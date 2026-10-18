import { beforeEach, describe, expect, it, vi } from 'vitest';

import { BROWSER_TAB_ID } from './browser-tab-state';

const toasts = vi.hoisted(() => ({ notify: vi.fn() }));

vi.mock('../../../components/toast-store', () => ({ notify: toasts.notify }));

const { browserTabOperation, announcedBrowserTabOperation, openBrowserAddress } =
  await import('./browser-tab-operation');

describe('browser tab operations', () => {
  beforeEach(() => {
    toasts.notify.mockClear();
  });

  it('tells the person when an announced operation fails', async () => {
    announcedBrowserTabOperation(Promise.reject(new Error('Close a tab to open another.')));
    await vi.waitFor(() => {
      expect(toasts.notify).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Close a tab to open another.', tone: 'critical' }),
      );
    });
  });

  it('stays quiet when an operation succeeds', async () => {
    announcedBrowserTabOperation(Promise.resolve());
    browserTabOperation(Promise.resolve());
    await Promise.resolve();
    expect(toasts.notify).not.toHaveBeenCalled();
  });

  it('leaves failures that the tab already shows inline without a toast', async () => {
    const rejected = Promise.reject(new Error('Only http and https addresses can be opened.'));
    browserTabOperation(rejected);
    await expect(rejected).rejects.toThrow('Only http and https');
    await Promise.resolve();
    expect(toasts.notify).not.toHaveBeenCalled();
  });

  it('opens a link that asked for a new window as its own tab at that address', () => {
    const tabId = BROWSER_TAB_ID.parse(globalThis.crypto.randomUUID());
    const opened: string[] = [];
    openBrowserAddress(
      {
        blank: () => tabId,
        address: (id, value) => opened.push(`${id} address ${value}`),
        navigate: (id, value) => {
          opened.push(`${id} navigate ${value}`);
          return Promise.resolve();
        },
      },
      'https://example.org/docs',
    );
    expect(opened).toEqual([
      `${tabId} address https://example.org/docs`,
      `${tabId} navigate https://example.org/docs`,
    ]);
  });

  it('tells the person when no further tab can be opened', () => {
    openBrowserAddress(
      {
        blank: () => {
          throw new Error('Close a tab to open another.');
        },
        address: () => undefined,
        navigate: () => Promise.resolve(),
      },
      'https://example.org',
    );
    expect(toasts.notify).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'A browser tab could not be opened.' }),
    );
  });
});
