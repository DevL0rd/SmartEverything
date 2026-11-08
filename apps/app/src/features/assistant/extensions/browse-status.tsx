import type { ReactNode } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { ApiError } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { Banner } from '../../../components/banner';
import { Button } from '../../../components/button';
import { useIsOwner, useSyncStatus } from '../../../store/selectors';
import { friendlyError } from '../../../format/errors';
import { ExtensionReadStatus } from './query-status';
import type { BrowseModel } from './use-browse';
import type { DiscoverySelection } from './discovery';
import type { useExtensions } from './queries';

function OnlineStatus({ model }: { readonly model: BrowseModel }): ReactNode {
  const { discovery, restart } = model;
  const online = discovery.data?.pages[0];
  if (discovery.error !== null && !discovery.isFetchNextPageError)
    return (
      <Banner
        tone="critical"
        title="Couldn’t load the online catalogue"
        body={friendlyError(discovery.error) ?? 'Try loading the catalogue again.'}
        action={{ label: 'Try again', onPress: restart }}
        wrapBody
      />
    );
  if (online !== undefined && online.unavailable_sources.length > 0)
    return (
      <Banner
        tone="warning"
        title="Some online sources couldn’t load"
        body={online.unavailable_sources.map((source) => source.url).join('\n')}
        action={{ label: 'Try again', onPress: restart }}
        wrapBody
      />
    );
  return model.waiting || (online === undefined && discovery.isFetching) ? (
    <ActivityIndicator
      colorClassName="accent-primary"
      accessibilityLabel="Searching online catalogue"
    />
  ) : null;
}

export function BrowseStatus({
  kind,
  installed,
  model,
}: {
  readonly kind: DiscoverySelection['kind'];
  readonly installed: ReturnType<typeof useExtensions>;
  readonly model: BrowseModel;
}): ReactNode {
  const owner = useIsOwner();
  const live = useSyncStatus().status === 'live';
  const local = model.selection.source === undefined;
  const loading = local && installed.data === undefined && installed.isFetching;
  return (
    <>
      <ExtensionReadStatus
        kind={kind}
        loading={loading}
        error={local ? installed.error : null}
        retry={() => {
          background(installed.refetch(), 'catalogue.refetch_failed');
        }}
      />
      {owner && live ? <OnlineStatus model={model} /> : null}
    </>
  );
}

function BrowsePageError({
  error,
  loadMore,
  restart,
}: Pick<BrowseModel, 'loadMore' | 'restart'> & { readonly error: Error }): ReactNode {
  const moved = error instanceof ApiError && error.reason === 'snapshot_moved';
  return (
    <View className="px-gutter pt-3">
      <Banner
        tone="warning"
        title={moved ? 'The catalogue changed' : 'Couldn’t load more results'}
        action={{
          label: moved ? 'Refresh results' : 'Try again',
          onPress: moved ? restart : loadMore,
        }}
      />
    </View>
  );
}

export function BrowseFooter({ model }: { readonly model: BrowseModel }): ReactNode {
  const owner = useIsOwner();
  const live = useSyncStatus().status === 'live';
  const { discovery, loadMore, restart, waiting } = model;
  if (!owner || !live || waiting || !discovery.hasNextPage) return null;
  if (discovery.isFetchingNextPage)
    return (
      <ActivityIndicator
        colorClassName="accent-primary"
        accessibilityLabel="Loading more results"
      />
    );
  const error = discovery.isFetchNextPageError ? discovery.error : null;
  if (error !== null)
    return <BrowsePageError error={error} loadMore={loadMore} restart={restart} />;
  return (
    <View className="items-center px-gutter pt-3">
      <Button label="Load more" variant="text" disabled={discovery.isFetching} onPress={loadMore} />
    </View>
  );
}
