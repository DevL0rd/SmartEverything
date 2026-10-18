import type { ReactNode } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { View, Linking } from 'react-native';
import { z } from 'zod';
import { API_ENDPOINTS as E, type HarnessExtensionItem } from '@smarteverything/domain';
import { SettingsFrame } from '../../../settings/settings-frame';
import { EmptyState } from '../../../components/empty-state';
import { confirm } from '../../../components/confirm-store';
import { ReasonLine } from '../../../components/reason-line';
import { List } from '../../../components/section';
import { ActionRow, NavRow, ValueRow } from '../../../components/rows';
import { useIsOwner, useSyncStatus } from '../../../store/selectors';
import { useMutationState } from '../../../store/mutation';
import { api } from '../../../api/transport';
import { useDiscoveryItem } from './discovery';
import { useExtensions } from './queries';
import { ItemHeader } from './item-header';
import { useMemberBanner } from './query-status';
import { extensionHref } from './links';
import { pageKind } from './items';

export function DiscoveryScreen(): ReactNode {
  const params = z
    .object({
      discoveryId: z.string(),
      source: z.string().optional(),
      page: z.array(z.string()).optional(),
    })
    .parse(useLocalSearchParams());
  const query = useDiscoveryItem(params.discoveryId, params.source);
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
        kind={item.kind}
        included={false}
        description={item.description}
        byline={item.publisher}
      />
      <List inset>
        <ValueRow title="License" value={item.license ?? 'Not reported'} />
        <NavRow
          title="Source"
          subtitle={item.source_url}
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
  const resolution = await api().call(E.resolveAiHarnessSkill, { body: item.install.source });
  const runsPrograms = resolution.candidates.some(
    (candidate) =>
      (item.install.select.length === 0 || item.install.select.includes(candidate.name)) &&
      candidate.executes,
  );
  if (
    runsPrograms &&
    !(await confirm({
      title: `Add ${item.name}?`,
      body: 'It runs programs on your computers. Add it only if you trust the source.',
      confirmLabel: 'Add extension',
    }))
  )
    return null;
  return api().call(E.installAiHarnessExtensions, {
    body: {
      source: item.install.source,
      ...(item.install.select.length === 0 ? {} : { select: item.install.select }),
      confirm_executes: runsPrograms,
    },
  });
}

function DiscoveryAcquisition({ item }: { readonly item: DiscoveryEntry }): ReactNode {
  const mutation = useMutationState();
  const router = useRouter();
  const owner = useIsOwner();
  const sync = useSyncStatus();
  const installed = useExtensions();
  const present =
    item.installed_id !== null &&
    installed.data?.items.some((entry) => entry.id === item.installed_id) === true;
  if (present && item.installed_id !== null)
    return (
      <NavRow
        title="Installed skill or extension"
        href={extensionHref(item.installed_id, item.kind)}
      />
    );
  return (
    <View className="gap-3">
      <List inset>
        <ActionRow
          title={mutation.busy ? 'Adding…' : item.kind === 'skill' ? 'Add skill' : 'Add extension'}
          disabled={!owner || sync.status !== 'live' || mutation.busy}
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
