import type {
  HarnessDiscoveryItem,
  HarnessDiscoveryPage,
  HarnessDiscoveryRequest,
} from '@smarteverything/domain';
import { CLAUDE_PLUGINS_SOURCE, type ClaudePlugins } from './claude-plugins';
import { communityExtensionPage } from './community-extensions';
import { HarnessDiscoverySourceError } from './discovery-http';

export async function extensionDiscoveryPage(
  plugins: ClaudePlugins,
  request: HarnessDiscoveryRequest,
): Promise<HarnessDiscoveryPage> {
  const snapshot = await plugins.snapshot(
    request.refresh,
    request.refresh ? undefined : request.snapshot,
  );
  const query = request.query.toLocaleLowerCase();
  const official = snapshot.items.filter((item) =>
    `${item.name} ${item.description} ${item.publisher}`.toLocaleLowerCase().includes(query),
  );
  const offset = (request.page - 1) * request.page_size;
  const items = official.slice(offset, offset + request.page_size);
  let total = official.length;
  let warning: string | undefined;
  try {
    const community = await communitySlice(
      request,
      Math.max(0, offset - official.length),
      request.page_size - items.length,
    );
    items.push(...community.items);
    total += community.total;
  } catch (cause: unknown) {
    const failure =
      cause instanceof HarnessDiscoverySourceError
        ? cause.message
        : 'Expected bounded valid community registry metadata; received an invalid or unreadable response.';
    warning = `${failure} Only approved official plugins are available.`;
  }
  return {
    source: CLAUDE_PLUGINS_SOURCE,
    snapshot: snapshot.commit,
    fetched_at: snapshot.fetched_at,
    stale: warning !== undefined,
    ...(warning === undefined ? {} : { warning }),
    items,
    total,
    next_page:
      offset + request.page_size >= total || request.page === 1000 ? null : request.page + 1,
  };
}

async function communitySlice(
  request: HarnessDiscoveryRequest,
  offset: number,
  count: number,
): Promise<{ readonly items: readonly HarnessDiscoveryItem[]; readonly total: number }> {
  const page = Math.floor(offset / request.page_size) + 1;
  const current = await communityExtensionPage({ ...request, page });
  const skip = offset % request.page_size;
  const items = current.items.slice(skip, skip + count);
  if (items.length < count && current.next_page !== null) {
    const next = await communityExtensionPage({ ...request, page: current.next_page });
    items.push(...next.items.slice(0, count - items.length));
  }
  return { items, total: current.total };
}
