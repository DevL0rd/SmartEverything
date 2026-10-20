import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { ProviderLinkRow } from '@smarteverything/domain';
import { SETTINGS } from '../settings';
import { failureOf, resendOf, startOf } from './tuya-link';

function row(change: Partial<ProviderLinkRow> = {}): ProviderLinkRow {
  return {
    provider: 'tuya',
    account_label: 'Smart Life account',
    status: 'linked',
    prompt: null,
    phase: null,
    problem: null,
    last_error: null,
    device_count: 2,
    updated_at: '2026-10-18T10:00:00.000Z',
    ...change,
  };
}

describe('where the Smart Life link starts', () => {
  it('asks for the User Code on the first link', () => {
    expect(startOf(null, false)).toBe('code');
    expect(startOf(row({ status: 'unlinked', account_label: null }), false)).toBe('code');
  });

  it('skips the User Code and opens on the QR code when an account is stored', () => {
    expect(startOf(row({ status: 'linked' }), false)).toBe('scan');
    expect(startOf(row({ status: 'needs_attention', problem: 'session_expired' }), false)).toBe(
      'scan',
    );
  });

  it('goes back to the User Code field when the person picks a different account', () => {
    expect(startOf(row({ status: 'linked' }), true)).toBe('code');
  });
});

describe('what a failed Smart Life link offers next', () => {
  it('sends a wrong User Code back to the code field with the lookup path and the capitals warning', () => {
    const failure = failureOf('bad_credentials', null);
    expect(failure).toMatchObject({ action: 'enter_code', actionLabel: 'Enter User Code' });
    expect(failure.body).toContain('Me > Settings > Account and Security > User Code');
    expect(failure.body).toContain('Capital letters matter.');
  });

  it('keeps the User Code for an expired code and offers a new one', () => {
    expect(failureOf('qr_expired', null)).toMatchObject({
      title: 'The code expired',
      action: 'new_code',
      actionLabel: 'New code',
    });
  });

  it('offers a scan alone after the session ended', () => {
    expect(failureOf('session_expired', null)).toMatchObject({
      action: 'scan_again',
      actionLabel: 'Scan again',
    });
  });

  it('says which apps work for an app that is not supported', () => {
    const failure = failureOf('not_supported', null);
    expect(failure).toMatchObject({ title: 'This app isn’t supported', action: 'enter_code' });
    expect(failure.body).toContain('Smart Life and Tuya Smart');
  });

  it('shows the hub’s own words for any other problem and lets the person retry', () => {
    expect(failureOf('network', 'Could not reach Tuya.')).toEqual({
      title: 'Couldn’t reach Tuya',
      body: 'Could not reach Tuya.',
      action: 'try_again',
      actionLabel: 'Try again',
    });
  });
});

describe('what a retry sends again', () => {
  it('sends the typed code again for a new code and the stored one for a new scan', () => {
    expect(resendOf('new_code', false)).toBe('typed');
    expect(resendOf('scan_again', true)).toBe('stored');
  });

  it('sends the stored code again on try again when the person only scans, so a failed relink never stalls', () => {
    expect(resendOf('try_again', true)).toBe('stored');
  });

  it('waits for the person on try again while the code is still being typed', () => {
    expect(resendOf('try_again', false)).toBe('none');
  });

  it('sends nothing when the person goes back to enter a code', () => {
    expect(resendOf('enter_code', true)).toBe('none');
    expect(resendOf('enter_code', false)).toBe('none');
  });
});

describe('the only Tuya link is Smart Life', () => {
  it('has no developer project setting or route', () => {
    expect(SETTINGS.map((setting) => setting.id)).not.toContain('connections.tuya-developer');
    expect(
      SETTINGS.filter((setting) => setting.id.startsWith('connections.tuya')).map((s) => s.title),
    ).toEqual(['Link Smart Life']);
    expect(
      existsSync(new URL('../../../../app/(flows)/connect/tuya-developer.tsx', import.meta.url)),
    ).toBe(false);
  });
});
