import { createHash } from 'node:crypto';
import { z } from 'zod';
import type {
  HarnessDiscoveryItem,
  HarnessDiscoveryPage,
  HarnessDiscoveryRequest,
} from '@smarteverything/domain';
import { readDiscoveryJson, HarnessDiscoverySourceError } from './discovery-http';

const SEGMENT = z
  .string()
  .regex(/^[A-Za-z0-9_.-]+$/u)
  .max(100)
  .refine((value) => value !== '.' && value !== '..');
const SUBPATH = z
  .string()
  .max(1000)
  .refine((value) => value.split('/').every((part) => SEGMENT.safeParse(part).success));
const RESPONSE = z.object({
  total: z.int().min(0).max(1_000_000),
  count: z.int().min(0).max(50),
  results: z
    .array(
      z.object({
        fullName: z.string().min(1).max(400),
        name: z.string().min(1).max(200),
        owner: SEGMENT,
        repo: SEGMENT,
        subpath: SUBPATH.nullable(),
        summary: z.string().max(2000),
        license: z.string().min(1).max(200).nullable(),
      }),
    )
    .max(50),
});
export const COMMUNITY_EXTENSIONS_SOURCE = {
  id: 'community-dsh-marketplace',
  label: 'Independent community extension marketplace',
  url: 'https://dshmarketplace.dev',
} as const;
const MAX_RESPONSE_BYTES = 1024 * 1024;

export async function communityExtensionPage(
  request: HarnessDiscoveryRequest,
): Promise<HarnessDiscoveryPage> {
  const url = new URL('/api/v1/plugins', COMMUNITY_EXTENSIONS_SOURCE.url);
  url.searchParams.set('q', request.query);
  url.searchParams.set('page', String(request.page));
  url.searchParams.set('limit', String(request.page_size));
  const input = await readDiscoveryJson(
    url.href,
    MAX_RESPONSE_BYTES,
    COMMUNITY_EXTENSIONS_SOURCE.label,
  );
  const response = RESPONSE.parse(input);
  if (response.count !== response.results.length || response.count > request.page_size)
    throw new HarnessDiscoverySourceError(
      COMMUNITY_EXTENSIONS_SOURCE.label,
      'Page count does not match the requested bounded page.',
    );
  const items = response.results.map(communityExtensionItem);
  return {
    source: COMMUNITY_EXTENSIONS_SOURCE,
    snapshot: createHash('sha256').update(JSON.stringify(response)).digest('hex'),
    fetched_at: new Date().toISOString(),
    stale: false,
    items,
    total: response.total,
    next_page:
      response.count === 0 ||
      request.page * request.page_size >= response.total ||
      request.page === 1000
        ? null
        : request.page + 1,
  };
}

function communityExtensionItem(
  row: z.infer<typeof RESPONSE>['results'][number],
): HarnessDiscoveryItem {
  const identity = `${row.owner}/${row.repo}${row.subpath === null ? '' : `#${row.subpath}`}`;
  if (row.fullName !== identity)
    throw new HarnessDiscoverySourceError(
      COMMUNITY_EXTENSIONS_SOURCE.label,
      'Canonical repository identity is inconsistent.',
    );
  return {
    id: `github-plugin:${identity}`,
    kind: 'extension' as const,
    name: row.name,
    description:
      row.summary === ''
        ? 'Community extension; inspect its source for requirements.'
        : row.summary,
    publisher: row.owner,
    license: row.license,
    installed_id: null,
    source_url: `https://github.com/${row.owner}/${row.repo}${row.subpath === null ? '' : `/tree/HEAD/${row.subpath}`}`,
    acquisition: {
      state: 'unsupported' as const,
      reason:
        'Independent community listing. SmartEverything has no registered immutable acquisition adapter for this extension; registry install verdicts do not grant runtime admission.',
    },
  };
}
