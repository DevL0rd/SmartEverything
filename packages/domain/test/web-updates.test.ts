import { describe, expect, it } from 'vitest';
import { WEB_UPDATE_STATUS, type WebUpdateStatus } from '../src';

const ID = '00000000-0000-4000-8000-000000000001';
const AT = '2026-10-25T10:00:00.000Z';
const HASH = 'cd'.repeat(32);

const OFFER = {
  id: ID,
  createdAt: AT,
  appVersion: '1.0.0',
  notes: 'Faster map',
  size: 30,
  files: [
    { path: 'index.html', sha256: HASH, size: 30, contentType: 'text/html', url: 'https://hub/f' },
  ],
};

const STATUSES: readonly WebUpdateStatus[] = [
  { state: 'disabled', reason: 'development build' },
  { state: 'idle', running: { id: 'embedded', createdAt: AT } },
  { state: 'idle', running: { id: ID, createdAt: AT } },
  { state: 'checking' },
  { state: 'available', offer: OFFER },
  { state: 'downloading', offer: OFFER, received: 10, total: 30 },
  { state: 'ready', offer: OFFER },
  { state: 'applying' },
  {
    state: 'needs_installer',
    newer: { id: ID, createdAt: AT, appVersion: '2.0.0', notes: 'New shell', size: 5 },
  },
  { state: 'failed', reason: 'hash mismatch', offer: null },
  { state: 'failed', reason: 'offline', offer: OFFER },
  { state: 'rolled_back', failedId: ID, reason: 'window crashed' },
];

describe('desktop web update status', () => {
  it('accepts every state', () => {
    for (const status of STATUSES) {
      expect(WEB_UPDATE_STATUS.parse(status)).toEqual(status);
    }
  });

  it('refuses unknown states, missing fields and extra fields', () => {
    expect(WEB_UPDATE_STATUS.safeParse({ state: 'paused' }).success).toBe(false);
    expect(WEB_UPDATE_STATUS.safeParse({ state: 'disabled' }).success).toBe(false);
    expect(WEB_UPDATE_STATUS.safeParse({ state: 'checking', extra: 1 }).success).toBe(false);
    expect(
      WEB_UPDATE_STATUS.safeParse({ state: 'downloading', offer: OFFER, received: -1, total: 3 })
        .success,
    ).toBe(false);
    expect(
      WEB_UPDATE_STATUS.safeParse({ state: 'idle', running: { id: 'other', createdAt: AT } })
        .success,
    ).toBe(false);
  });
});
