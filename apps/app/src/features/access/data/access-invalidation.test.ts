import { describe, expect, it } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import type { ClientRow, LiveChange } from '@smarteverything/domain';
import { applyToWindows } from '../../../queries/live-invalidations';
import { ACCESS_PREFIX } from '../../../queries/keys';

const CLIENT: ClientRow = {
  id: '00000000-0000-4000-8000-0000000000c1',
  name: 'Mia phone',
  platform: 'android',
  kind: 'phone',
  role: 'member',
  built_in: false,
  profile_id: '00000000-0000-4000-8000-000000000001',
  created_at: '2026-10-01T00:00:00.000Z',
  last_seen_at: null,
};

const PEOPLE_KEY = [...ACCESS_PREFIX, 'people'] as const;

function pairedChange(): LiveChange {
  return {
    type: 'change',
    table: 'clients',
    operation: 'INSERT',
    record: CLIENT,
    oldRecord: null,
    seq: 1,
  };
}

function otherChange(): LiveChange {
  return {
    type: 'change',
    table: 'state_history',
    operation: 'INSERT',
    record: null,
    oldRecord: null,
    seq: 2,
  };
}

function primed(): QueryClient {
  const client = new QueryClient();
  client.setQueryData(PEOPLE_KEY, []);
  return client;
}

describe('access queries and live changes', () => {
  it('refetches the access list when a device is paired or a person changes', () => {
    const client = primed();
    applyToWindows(client, [pairedChange()]);
    expect(client.getQueryState(PEOPLE_KEY)?.isInvalidated).toBe(true);
  });

  it('leaves the access list alone for unrelated changes', () => {
    const client = primed();
    applyToWindows(client, [otherChange()]);
    expect(client.getQueryState(PEOPLE_KEY)?.isInvalidated).toBe(false);
  });
});
