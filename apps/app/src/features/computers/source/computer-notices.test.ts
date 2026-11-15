import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { EntityStore } from '../../../store/entity-store';
import { COMPUTER_NOTICES } from '../data/notices';
import { listKey } from './computer-keys';

const DEVICE = '0b9f3c2e-3c38-4a4f-9d55-6a1f6d4b2a10';

function rig(): { client: QueryClient; invalidated: unknown[] } {
  const client = new QueryClient();
  const invalidated: unknown[] = [];
  client.invalidateQueries = (filters): Promise<void> => {
    invalidated.push(filters?.queryKey);
    return Promise.resolve();
  };
  return { client, invalidated };
}

describe('computer file change notices', () => {
  it('refreshes the changed folder of that computer in every sort order', () => {
    const { client, invalidated } = rig();
    COMPUTER_NOTICES.receive(
      { type: 'computer_files_changed', deviceId: DEVICE, path: '/home/dana' },
      { client, store: new EntityStore(), live: true },
    );
    expect(invalidated).toEqual([listKey(DEVICE, '/home/dana')]);
  });

  it('matches the keys the folder queries are stored under', () => {
    const { client } = rig();
    const sorted = [...listKey(DEVICE, '/home/dana'), 'name', 'asc'];
    client.setQueryData(sorted, { pages: [], pageParams: [] });
    const matches = client.getQueryCache().findAll({ queryKey: listKey(DEVICE, '/home/dana') });
    expect(matches.map((query) => query.queryKey)).toEqual([sorted]);
    const other = client.getQueryCache().findAll({ queryKey: listKey(DEVICE, '/home/other') });
    expect(other).toEqual([]);
  });
});
