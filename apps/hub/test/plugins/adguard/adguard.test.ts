import { describe, expect, it } from 'vitest';
import { AdGuardClient } from '../../../src/plugins/builtin/adguard/adguard-client';
import {
  changeProtection,
  readQueryLog,
  setDomainRule,
} from '../../../src/plugins/builtin/adguard/controls';
import { JsonApiRefusedError } from '../../../src/plugins/builtin/json-api';
import { queryOf, statusOf } from '../../../src/plugins/builtin/adguard/readings';
import { withDomainRule } from '../../../src/plugins/builtin/adguard/user-rules';
import type { FetchLike } from '../../../src/plugins/builtin/fetch-like';
import { fakeHttp } from '../fake-http';

const SIGN_IN = { user: 'person', password: 'test-only' };

function clientFor(routes: Parameters<typeof fakeHttp>[0]): {
  client: AdGuardClient;
  calls: ReturnType<typeof fakeHttp>['calls'];
} {
  const { fetcher, calls } = fakeHttp(routes);
  return { client: new AdGuardClient('http://adguard.test:3000', SIGN_IN, fetcher), calls };
}

describe('AdGuard readings', () => {
  it('turns a pause duration into an end time', () => {
    const now = new Date('2026-10-10T10:00:00Z');
    const status = statusOf(
      {
        version: 'v0.107.60',
        running: true,
        protection_enabled: false,
        protection_disabled_duration: 3_600_000,
      },
      now,
    );
    expect(status).toEqual({
      version: 'v0.107.60',
      running: true,
      protection: false,
      pausedUntil: '2026-10-10T11:00:00.000Z',
    });
  });

  it('classifies query outcomes', () => {
    const row = {
      time: '2026-10-10T10:00:00Z',
      question: { name: 'ads.example.com', type: 'A' },
      client: '192.168.50.20',
      reason: 'FilteredBlackList',
      rules: [{ text: '||ads.example.com^' }],
      elapsedMs: '0.42',
      cached: false,
    };
    expect(queryOf(row)).toMatchObject({
      outcome: 'blocked',
      rule: '||ads.example.com^',
      elapsedMs: 0.4,
    });
    expect(queryOf({ ...row, reason: 'NotFilteredNotFound', rules: null })).toMatchObject({
      outcome: 'allowed',
      rule: null,
    });
  });
});

describe('AdGuard controls', () => {
  it('pauses with a duration and turns back on', async () => {
    const { client, calls } = clientFor({ 'POST /control/protection': null });
    await changeProtection(client, { enabled: false, minutes: 60 });
    await changeProtection(client, { enabled: true });
    expect(calls.map((call) => call.body)).toEqual([
      { enabled: false, duration: 3_600_000 },
      { enabled: true },
    ]);
  });

  it('swaps a block rule for an allow rule and removes it', async () => {
    expect(withDomainRule(['||a.com^', '! note'], 'a.com', 'allow')).toEqual([
      '! note',
      '@@||a.com^',
    ]);
    expect(withDomainRule(['@@||a.com^'], 'a.com', 'remove')).toEqual([]);
    const { client, calls } = clientFor({
      'GET /control/filtering/status': { user_rules: ['@@||b.com^'] },
      'POST /control/filtering/set_rules': null,
    });
    await setDomainRule(client, 'b.com', 'block');
    expect(calls[1]?.body).toEqual({ rules: ['||b.com^'] });
  });

  it('pages the query log with a cursor', async () => {
    const row = {
      time: '2026-10-10T10:00:00Z',
      question: { name: 'x.com', type: 'A' },
      client: '10.0.0.2',
      reason: 'NotFilteredNotFound',
    };
    const { client, calls } = clientFor({
      'GET /control/querylog': { data: [row, row], oldest: '2026-10-10T09:59:00Z' },
    });
    const page = await readQueryLog(client, {
      search: '',
      filter: 'blocked',
      olderThan: null,
      limit: 2,
    });
    expect(page.olderThan).toBe('2026-10-10T09:59:00.000Z');
    expect(calls[0]?.query).toEqual({ limit: '2', response_status: 'filtered' });
  });

  it('reports a refused sign-in', async () => {
    const refusing: FetchLike = () => Promise.resolve(new Response('', { status: 401 }));
    const client = new AdGuardClient('http://adguard.test:3000', SIGN_IN, refusing);
    await expect(changeProtection(client, { enabled: true })).rejects.toBeInstanceOf(
      JsonApiRefusedError,
    );
  });
});
