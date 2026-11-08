import {
  HARNESS_EXTENSION_ITEM,
  type HarnessDiscoveryItem,
  type HarnessDiscoveryPage,
  type HarnessGitOrigin,
} from '@smarteverything/domain';
import { InfiniteQueryObserver, QueryClient } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { browseSections, browseItemKey } from './browse-items';
import { discoveryHref } from './links';

const call = vi.hoisted(() => vi.fn());

vi.mock('../../../api/transport', () => ({ api: (): { call: typeof call } => ({ call }) }));
vi.mock('../../../store/selectors', () => ({
  useSyncStatus: (): { status: string } => ({ status: 'live' }),
}));

const { discoveryOptions, findDiscoveryItem } = await import('./discovery');

const SNAPSHOT = 'a'.repeat(40);

function entry(name: string): HarnessDiscoveryItem {
  return {
    id: `skill:${name}`,
    kind: 'skill',
    name,
    description: name,
    publisher: 'Publisher',
    license: null,
    source_url: 'https://example.test/repo',
    executes: false,
    reference: {
      source: { url: 'https://example.test/repo' },
      snapshot: SNAPSHOT,
      id: `skill:${name}`,
    },
    installed_id: null,
    installed_version: null,
    available_version: null,
    update: 'not_installed',
  };
}

function page(items: readonly HarnessDiscoveryItem[], next: number | null): HarnessDiscoveryPage {
  return {
    unavailable_sources: [],
    sources: [
      {
        source: { url: 'https://example.test/repo' },
        label: 'm',
        publisher: 'Publisher',
        snapshot: SNAPSHOT,
        fetched_at: '2026-10-17T10:00:00.000Z',
      },
    ],
    snapshot: SNAPSHOT,
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
    await expect(findDiscoveryItem({ id: 'skill:pdf' })).resolves.toMatchObject({ name: 'pdf' });
    expect(call).toHaveBeenCalledTimes(2);
    expect(call.mock.calls[1]?.[1]).toMatchObject({
      body: { page: 2, snapshot: SNAPSHOT },
    });
  });

  it('searches the same custom source the item was listed from', async () => {
    call.mockResolvedValueOnce(page([entry('pdf')], null));
    await findDiscoveryItem({
      id: 'skill:pdf',
      source: { url: 'https://example.test/repo', ref: 'main', path: 'skills' },
    });
    expect(call.mock.calls[0]?.[1]).toMatchObject({
      body: {
        kind: 'skill',
        query: 'pdf',
        source: { url: 'https://example.test/repo', ref: 'main', path: 'skills' },
      },
    });
  });

  it('asks the hub for plugins when the page lists extensions', async () => {
    call.mockResolvedValueOnce(page([], null));
    await expect(findDiscoveryItem({ id: 'plugin:tools' })).rejects.toThrow('no such item');
    expect(call.mock.calls[0]?.[1]).toMatchObject({
      body: { kind: 'plugin', query: 'tools' },
    });
  });

  it('rejects an id that is not a catalogue id and an item the catalogue lacks', async () => {
    await expect(findDiscoveryItem({ id: 'browser' })).rejects.toThrow('not a catalogue item');
    call.mockResolvedValueOnce(page([], null));
    await expect(findDiscoveryItem({ id: 'skill:missing' })).rejects.toThrow('no such item');
  });
});

it('appends only requested pages and restarts at page one when the search changes', async () => {
  call.mockReset();
  call
    .mockResolvedValueOnce(page([entry('write')], 2))
    .mockResolvedValueOnce(page([entry('read')], null))
    .mockResolvedValueOnce(page([entry('pdf')], null));
  const selection = { kind: 'skill', query: '' } as const;
  const client = new QueryClient();
  const browse = new InfiniteQueryObserver(client, discoveryOptions(selection, true));
  try {
    await browse.refetch();
    expect(call).toHaveBeenCalledTimes(1);
    expect(
      (await browse.fetchNextPage()).data?.pages.flatMap((result) =>
        result.items.map((item) => item.name),
      ),
    ).toEqual(['write', 'read']);
    expect(call.mock.calls[1]?.[1]).toMatchObject({ body: { page: 2, snapshot: SNAPSHOT } });

    browse.setOptions(discoveryOptions({ ...selection, query: 'pdf' }, true));
    const searched = await browse.refetch();
    expect(searched.data?.pages[0]?.items.map((item) => item.name)).toEqual(['pdf']);
    expect(call.mock.calls[2]?.[1]).toEqual({ body: { kind: 'skill', query: 'pdf', page: 1 } });
  } finally {
    client.clear();
  }
});

it('includes matching bundled skills and keeps offers from different sources distinct', () => {
  const pdf = entry('pdf');
  const alternate = {
    ...pdf,
    reference: { ...pdf.reference, source: { ...pdf.reference.source, path: 'more' } },
  };
  const results = browseSections(
    { kind: 'skill', query: 'pdf' },
    {
      items: [],
      bundled_skills: [
        {
          kind: 'bundled_skill',
          id: 'reports',
          name: 'Reports',
          description: 'Read PDF reports',
          publisher: 'SmartEverything',
          revision: SNAPSHOT,
          content: 'Read reports.',
        },
        {
          kind: 'bundled_skill',
          id: 'write',
          name: 'Write',
          description: 'Write reports',
          publisher: 'SmartEverything',
          revision: SNAPSHOT,
          content: 'Write reports.',
        },
      ],
    },
    [page([pdf, alternate], null)],
  );

  expect(results.map((section) => section.data.map((row) => row.item.id))).toEqual([
    ['reports'],
    ['skill:pdf', 'skill:pdf'],
  ]);
  expect(new Set(results.flatMap((section) => section.data.map(browseItemKey))).size).toBe(3);
  expect(discoveryHref(alternate)).toMatchObject({ params: { sourcePath: 'more' } });
});

const PDF_ORIGIN = { url: 'https://example.test/repo', ref: 'main', path: 'skills/pdf' };

function pdfOffer(origin: HarnessGitOrigin): HarnessDiscoveryItem {
  const pdf = entry('pdf');
  return { ...pdf, reference: { ...pdf.reference, origin }, source_url: origin.url };
}

const installedPdf = HARNESS_EXTENSION_ITEM.parse({
  id: 'skill:pdf',
  kind: 'skill',
  name: 'pdf',
  description: 'Read PDF documents',
  publisher: 'Fixture',
  license: null,
  capabilities: [],
  requirements: [],
  platforms: ['linux'],
  enabled: true,
  config: {},
  source: { kind: 'git', ...PDF_ORIGIN, commit: SNAPSHOT },
  version: 'original',
  executes: false,
  confirmed: false,
});

it('merges the exact installed offer and repeated pages, keeping distinct refs and folders', () => {
  const installed = pdfOffer(PDF_ORIGIN);
  const branch = pdfOffer({ ...PDF_ORIGIN, ref: 'other' });
  const folder = pdfOffer({ ...PDF_ORIGIN, path: 'more/pdf' });
  const provider = pdfOffer({ ...PDF_ORIGIN, url: 'https://other.test/repo' });
  const rows = browseSections({ kind: 'skill', query: 'pdf' }, { items: [installedPdf] }, [
    page([installed, branch, folder, provider], 2),
    page([installed, branch, folder], null),
  ]).flatMap((section) => section.data);

  expect(
    rows.map((row) => (row.origin === 'online' ? row.installation.status : row.origin)),
  ).toEqual(['local', 'conflict', 'conflict', 'conflict']);
  expect(new Set(rows.map(browseItemKey)).size).toBe(4);
  expect(discoveryHref(branch)).toMatchObject({
    params: { originRef: 'other', originPath: 'skills/pdf' },
  });
});

it('marks an online result installed only when its whole origin matches the installed item', () => {
  const rows = browseSections(
    { kind: 'skill', query: '' },
    { items: [installedPdf] },
    [page([pdfOffer(PDF_ORIGIN), entry('pdf')], null)],
    false,
  ).flatMap((section) => section.data);
  expect(
    rows.map((row) => (row.origin === 'online' ? row.installation.status : row.origin)),
  ).toEqual(['installed', 'conflict']);
});

it('reopens a same-name offer by its origin even within the same catalogue', async () => {
  call.mockReset();
  const other = pdfOffer({ ...PDF_ORIGIN, path: 'another/pdf' });
  call.mockResolvedValueOnce(page([pdfOffer(PDF_ORIGIN), other], null));
  await expect(findDiscoveryItem(other.reference)).resolves.toEqual(other);
});

it('shows installed skills when the default online catalogue has no entries', () => {
  const results = browseSections(
    { kind: 'skill', query: '' },
    { items: [installedPdf] },
    [page([], null)],
    false,
  );
  expect(results).toEqual([
    {
      key: 'local',
      title: 'Included and installed',
      data: [{ origin: 'local', item: installedPdf }],
    },
  ]);
});
