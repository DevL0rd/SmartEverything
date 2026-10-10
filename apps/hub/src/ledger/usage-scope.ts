import { ApiError, USAGE_FILTER, type UsageFilter, type UsageQuery } from '@smarteverything/domain';
import { invalid } from '../server/errors';

export type UsageViewer =
  { readonly role: 'owner' } | { readonly role: 'member'; readonly profileId: string };

function profilesFor(query: UsageQuery, viewer: UsageViewer): readonly string[] | undefined {
  if (viewer.role !== 'member') {
    return query.profileIds;
  }
  const others = (query.profileIds ?? []).filter((id) => id !== viewer.profileId);
  if (others.length > 0) {
    throw new ApiError('forbidden', 'Only the owner can see what other people spent on AI.');
  }
  return [viewer.profileId];
}

export function usageFilterFor(query: UsageQuery, viewer: UsageViewer): UsageFilter {
  const profileIds = profilesFor(query, viewer);
  const { from, to, clientIds, works, sources, modelIds, chatId, messageId, pluginId } = query;
  const parsed = USAGE_FILTER.safeParse({
    from,
    to,
    profileIds,
    clientIds,
    works,
    sources,
    modelIds,
    chatId,
    messageId,
    pluginId,
  });
  if (!parsed.success) {
    throw invalid('usage filter', parsed.error);
  }
  return parsed.data;
}
