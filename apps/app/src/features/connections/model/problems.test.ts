import { describe, expect, it } from 'vitest';
import type { ProviderLinkRow } from '@smarteverything/domain';
import { isAccount, linkSummary, problemTitle } from './problems';

function row(change: Partial<ProviderLinkRow> = {}): ProviderLinkRow {
  return {
    provider: 'xiaomi',
    account_label: null,
    status: 'linked',
    prompt: null,
    phase: null,
    problem: null,
    last_error: null,
    device_count: 0,
    updated_at: '2026-10-16T10:00:00.000Z',
    ...change,
  };
}

describe('problemTitle', () => {
  it('names the provider in the problems that blame it', () => {
    expect(problemTitle('smartthings', 'permission_denied')).toBe('SmartThings refused access');
    expect(problemTitle('xiaomi', 'network')).toBe('Couldn’t reach Xiaomi');
    expect(problemTitle('tuya', 'session_expired')).toBe('Tuya signed you out');
  });

  it('asks about the code for Tuya and the password for the other providers', () => {
    expect(problemTitle('tuya', 'bad_credentials')).toBe('That code didn’t work');
    expect(problemTitle('xiaomi', 'bad_credentials')).toBe('Wrong account or password');
  });
});

describe('linkSummary', () => {
  it('asks for the person while a prompt is open, whatever the status', () => {
    const prompt = { kind: 'accept_on_device', device: 'Phone' } as const;
    expect(linkSummary(row({ status: 'linking', phase: 'discovering', prompt }))).toEqual({
      text: 'Waiting for you',
      tone: 'primary',
    });
  });

  it('says what a link in progress is doing, defaulting to signing in', () => {
    expect(linkSummary(row({ status: 'linking' }))).toEqual({
      text: 'Signing in…',
      tone: 'primary',
    });
    expect(linkSummary(row({ status: 'linking', phase: 'discovering' })).text).toBe(
      'Finding devices…',
    );
    expect(linkSummary(row({ status: 'linking', phase: 'awaiting_answer' })).text).toBe(
      'Waiting for you',
    );
  });

  it('shows the account and its device count for a linked provider', () => {
    expect(linkSummary(row({ account_label: 'me@home.test', device_count: 1 }))).toEqual({
      text: 'me@home.test · 1 device',
      tone: 'variant',
    });
    expect(linkSummary(row({ account_label: 'me@home.test', device_count: 4 })).text).toBe(
      'me@home.test · 4 devices',
    );
    expect(linkSummary(row({ device_count: 0 })).text).toBe('0 devices');
  });

  it('shows the problem in critical tone when the link needs attention or is unlinked', () => {
    expect(linkSummary(row({ status: 'needs_attention', problem: 'network' }))).toEqual({
      text: 'Couldn’t reach Xiaomi',
      tone: 'critical',
    });
    expect(
      linkSummary(row({ status: 'unlinked', provider: 'tuya', problem: 'cancelled' })),
    ).toEqual({
      text: 'Sign-in was cancelled',
      tone: 'critical',
    });
    expect(linkSummary(row({ status: 'needs_attention' })).text).toBe('That didn’t work');
  });
});

describe('isAccount', () => {
  it('counts addable providers that are not unlinked', () => {
    expect(isAccount(row({ provider: 'tuya', status: 'linked' }))).toBe(true);
    expect(isAccount(row({ provider: 'tuya', status: 'needs_attention' }))).toBe(true);
    expect(isAccount(row({ provider: 'tuya', status: 'unlinked' }))).toBe(false);
  });

  it('never counts providers the person cannot add', () => {
    expect(isAccount(row({ provider: 'local', status: 'linked' }))).toBe(false);
    expect(isAccount(row({ provider: 'samsung_tv', status: 'linked' }))).toBe(false);
  });
});
