import { describe, expect, it } from 'vitest';
import {
  overlayMenuEntries,
  overlayMenuItems,
  overlayMenuSignature,
} from '../src/overlay/overlay-tray-menu.js';
import { call, HIDDEN, host, input } from './support/overlay-views.js';

function labels(view = host()): string[] {
  return overlayMenuEntries(view).map((entry) => entry.label);
}

describe('overlay tray menu', () => {
  it('has no items while the overlay is hidden', () => {
    expect(overlayMenuItems(null, () => undefined)).toEqual([]);
    expect(overlayMenuItems(HIDDEN, () => undefined)).toEqual([]);
    expect(overlayMenuSignature(HIDDEN)).toBe('');
  });

  it('shows the AI status first and a separator last', () => {
    const items = overlayMenuItems(host(), () => undefined);
    expect(items[0]).toEqual({ label: 'AI: Listening', enabled: false });
    expect(items.at(-1)).toEqual({ type: 'separator' });
  });

  it('lists mute as a checkbox and the end control', () => {
    expect(labels()).toEqual(['Mute', 'End call']);
    expect(overlayMenuEntries(host(input({ call: call({ muted: true }) })))[0]).toMatchObject({
      checked: true,
      action: { kind: 'mute' },
    });
  });

  it('adds Stop the assistant talking only while it speaks', () => {
    expect(labels(host(input({ call: call({ phase: 'speaking', said: 'Done' }) })))).toContain(
      'Stop the assistant talking',
    );
    expect(labels()).not.toContain('Stop the assistant talking');
  });

  it('adds Stop sharing while a screen is shared and Retry on an error', () => {
    const sharing = host(input({ call: call({ sharing: { kind: 'screen', label: null } }) }));
    expect(labels(sharing)).toContain('Stop sharing');
    const error = host(
      input({ call: call({ problem: { text: 'no route', at: 99_000, fix: null } }) }),
    );
    expect(labels(error)).toContain('Retry');
  });

  it('answers the request without opening the overlay', () => {
    const view = host(
      input({
        call: call({ request: { what: 'desktop_screen', why: 'To check', expiresAt: null } }),
      }),
    );
    const entries = overlayMenuEntries(view);
    expect(entries.slice(0, 2)).toEqual([
      { label: 'Share screen', checked: null, action: { kind: 'accept_request' } },
      { label: 'Not now', checked: null, action: { kind: 'decline_request' } },
    ]);
  });

  it('changes its signature only when the menu would change', () => {
    const base = overlayMenuSignature(host());
    const moreWords = host(input({ call: call({ heard: 'a lot more words were said' }) }));
    expect(overlayMenuSignature(moreWords)).toBe(base);
    expect(overlayMenuSignature(host(input({ call: call({ muted: true }) })))).not.toBe(base);
  });
});
