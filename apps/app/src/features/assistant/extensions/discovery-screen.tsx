import type { ReactNode } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { View, Linking } from 'react-native';
import { z } from 'zod';
import { ApiError, API_ENDPOINTS as E, type HarnessExtensionItem } from '@smarteverything/domain';
import { SettingsFrame } from '../../../settings/settings-frame';
import { EmptyState } from '../../../components/empty-state';
import { Banner } from '../../../components/banner';
import { confirm } from '../../../components/confirm-store';
import { ReasonLine } from '../../../components/reason-line';
import { List } from '../../../components/section';
import { ActionRow, NavRow, ValueRow } from '../../../components/rows';
import { useIsOwner, useSyncStatus } from '../../../store/selectors';
import { useMutationState } from '../../../store/mutation';
import { api } from '../../../api/transport';
import { useDiscoveryItem, type DiscoveryTarget } from './discovery';
import { useExtensions } from './queries';
import { ItemHeader } from './item-header';
import { useMemberBanner } from './query-status';
import { extensionHref } from './links';
import { pageKind } from './items';
import { offerInstallation, offerSourceLabel } from './offer-source';

const PARAMS = z.object({
  discoveryId: z.string(),
  source: z.string().optional(),
  sourceRef: z.string().optional(),
  sourcePath: z.string().optional(),
  originUrl: z.string().optional(),
  originRef: z.string().optional(),
  originPath: z.string().optional(),
  page: z.array(z.string()).optional(),
});

function targetOf(params: z.infer<typeof PARAMS>): DiscoveryTarget {
  const { discoveryId, source, sourceRef, sourcePath, originUrl, originRef, originPath } = params;
  return {
    id: discoveryId,
    ...(source === undefined ? {} : { source: { url: source, ref: sourceRef, path: sourcePath } }),
    ...(originUrl === undefined
      ? {}
      : { origin: { url: originUrl, ref: originRef ?? null, path: originPath ?? null } }),
  };
}

export function DiscoveryScreen(): ReactNode {
  const params = PARAMS.parse(useLocalSearchParams());
  const query = useDiscoveryItem(targetOf(params));
  const item = query.data;
  const kind = params.page?.[1] === 'skills' ? 'skill' : 'extension';
  const banner = useMemberBanner('add skills and extensions');
  return (
    <SettingsFrame
      page={kind === 'skill' ? 'assistant/skills/detail' : 'assistant/extensions/detail'}
      title={item?.name ?? 'Catalogue item'}
      {...(banner === undefined ? {} : { banner })}
    >
      {item === undefined ? (
        <DiscoveryMissing loading={query.isFetching} />
      ) : (
        <DiscoveryDetail item={item} />
      )}
    </SettingsFrame>
  );
}
function DiscoveryMissing({ loading }: { readonly loading: boolean }): ReactNode {
  return loading ? null : (
    <EmptyState
      icon="puzzle"
      title="Catalogue item unavailable"
      body="Browse the catalogue again to load this item."
    />
  );
}
function DiscoveryDetail({ item }: { readonly item: DiscoveryEntry }): ReactNode {
  const mutation = useMutationState();
  return (
    <View className="gap-section-gap">
      <ItemHeader
        icon={item.kind === 'skill' ? 'fileText' : 'puzzle'}
        kind={pageKind(item)}
        included={false}
        description={item.description}
        byline={item.publisher}
      />
      <List inset>
        <ValueRow title="License" value={item.license ?? 'Not reported'} />
        <NavRow
          title="Source"
          subtitle={offerSourceLabel(item)}
          wrapSubtitle
          onPress={() => {
            mutation.run(() => Linking.openURL(item.source_url), {
              failure: 'Source could not be opened',
            });
          }}
        />
      </List>
      <DiscoveryAcquisition item={item} />
    </View>
  );
}

function AddReason(): ReactNode {
  const owner = useIsOwner();
  const live = useSyncStatus().status === 'live';
  return owner && !live ? (
    <ReasonLine icon="wifiOff" text="Adding needs your home hub. Reconnect to continue." />
  ) : null;
}

type DiscoveryEntry = NonNullable<ReturnType<typeof useDiscoveryItem>['data']>;

async function addDiscoveryItem(
  item: DiscoveryEntry,
): Promise<readonly HarnessExtensionItem[] | null> {
  const previewed = await api().call(E.previewAiHarnessExtensions, {
    body: { items: [item.reference] },
  });
  const runsPrograms = previewed.results.some((result) => !result.ok || result.preview.executes);
  if (
    runsPrograms &&
    !(await confirm({
      title: `Add ${item.name}?`,
      body: 'It runs programs on your computers. Add it only if you trust the source.',
      confirmLabel: 'Add extension',
    }))
  )
    return null;
  const installed = await api().call(E.installAiHarnessExtensions, {
    body: { items: [item.reference], confirm_executes: runsPrograms },
  });
  return installed.results.map((result) => {
    if (!result.ok) throw new ApiError(result.error.code, result.error.message);
    return result.item;
  });
}

function DiscoveryAcquisition({ item }: { readonly item: DiscoveryEntry }): ReactNode {
  const catalogue = useExtensions();
  const current = catalogue.data?.items.find((entry) => entry.id === item.id);
  const installation = offerInstallation(item, current);
  if (installation.status === 'installed')
    return (
      <NavRow
        title={item.kind === 'skill' ? 'Installed skill' : 'Installed extension'}
        href={extensionHref(installation.item.id, pageKind(installation.item))}
      />
    );
  if (installation.status === 'conflict')
    return (
      <Banner
        tone="warning"
        title="Name already in use"
        body="An installed item already uses this name. Only one source can be installed under this name."
        wrapBody
      />
    );
  return <DiscoveryInstall item={item} catalogueReady={catalogue.data !== undefined} />;
}

function DiscoveryInstall({
  item,
  catalogueReady,
}: {
  readonly item: DiscoveryEntry;
  readonly catalogueReady: boolean;
}): ReactNode {
  const mutation = useMutationState();
  const router = useRouter();
  const owner = useIsOwner();
  const sync = useSyncStatus();
  return (
    <View className="gap-3">
      <List inset>
        <ActionRow
          title={mutation.busy ? 'Adding…' : item.kind === 'skill' ? 'Add skill' : 'Add extension'}
          disabled={!catalogueReady || !owner || sync.status !== 'live' || mutation.busy}
          onPress={() => {
            mutation.run(() => addDiscoveryItem(item), {
              failure: 'Could not be added',
              onDone: (added) => {
                const [first] = added ?? [];
                if (first !== undefined) router.push(extensionHref(first.id, pageKind(first)));
              },
            });
          }}
        />
      </List>
      <AddReason />
    </View>
  );
}
