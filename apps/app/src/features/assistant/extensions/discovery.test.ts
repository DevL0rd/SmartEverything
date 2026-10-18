import { type HarnessDiscoveryItem, type HarnessDiscoveryPage } from '@smarteverything/domain';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const call = vi.hoisted(() => vi.fn());

vi.mock('../../../api/transport', () => ({ api: (): { call: typeof call } => ({ call }) }));
vi.mock('../../../store/selectors', () => ({
  useSyncStatus: (): { status: string } => ({ status: 'live' }),
}));

const { findDiscoveryItem } = await import('./discovery');

function entry(name: string): HarnessDiscoveryItem {
  return {
    id: `skill:${name}`,
    kind: 'skill',
    name,
    description: name,
    publisher: 'Publisher',
    license: null,
    source_url: 'https://example.test/repo',
    installed_id: null,
    install: { source: { url: 'https://example.test/repo' }, select: [name] },
  };
}

function page(items: readonly HarnessDiscoveryItem[], next: number | null): HarnessDiscoveryPage {
  return {
    source: { id: 'm', label: 'm', url: 'https://example.test/repo' },
    snapshot: 's',
    fetched_at: '2026-10-17T10:00:00.000Z',
    items: [...items],
    total: items.length,
    next_page: next,
  };
}

describe('findDiscoveryItem', () => {
  beforeEach(() => {
    call.mockReset();
  });

  it('finds an item on a later page by its id alone', async () => {
    call
      .mockResolvedValueOnce(page([entry('pdf-tools')], 2))
      .mockResolvedValueOnce(page([entry('pdf')], null));
    await expect(findDiscoveryItem('skill:pdf')).resolves.toMatchObject({ name: 'pdf' });
    expect(call).toHaveBeenCalledTimes(2);
  });

  it('searches the same custom source the item was listed from', async () => {
    call.mockResolvedValueOnce(page([entry('pdf')], null));
    await findDiscoveryItem('skill:pdf', 'https://example.test/repo');
    expect(call.mock.calls[0]?.[1]).toMatchObject({
      body: { kind: 'skill', query: 'pdf', source: { url: 'https://example.test/repo' } },
    });
  });

  it('rejects an id that is not a catalogue id and an item the catalogue lacks', async () => {
    await expect(findDiscoveryItem('browser')).rejects.toThrow('not a catalogue item');
    call.mockResolvedValueOnce(page([], null));
    await expect(findDiscoveryItem('skill:missing')).rejects.toThrow('no such item');
  });
});
