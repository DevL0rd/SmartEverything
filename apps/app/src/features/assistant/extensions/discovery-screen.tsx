import type { ReactNode } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { View, Linking } from 'react-native';
import { z } from 'zod';
import { API_ENDPOINTS as E } from '@smarteverything/domain';
import { SettingsFrame } from '../../../settings/settings-frame';
import { EmptyState } from '../../../components/empty-state';
import { Text } from '../../../components/text';
import { List } from '../../../components/section';
import { ActionRow, NavRow, ValueRow } from '../../../components/rows';
import { useIsOwner, useSyncStatus } from '../../../store/selectors';
import { useMutationState } from '../../../store/mutation';
import { api } from '../../../api/transport';
import { useDiscoveryItem } from './discovery';
import { useExtensions, RESOLVED_EXTENSION_KEY } from './queries';
import { extensionHref } from './links';

export function DiscoveryScreen(): ReactNode {
  const params = z
    .object({ discoveryId: z.string().max(400), page: z.array(z.string()).optional() })
    .parse(useLocalSearchParams());
  const item = useDiscoveryItem(params.discoveryId).data;
  const kind = params.page?.[1] === 'skills' ? 'skill' : 'extension';
  return (
    <SettingsFrame
      page={kind === 'skill' ? 'assistant/skills/detail' : 'assistant/extensions/detail'}
      title={item?.name ?? 'Catalogue item'}
    >
      {item === undefined ? (
        <EmptyState
          icon="puzzle"
          title="Catalogue item unavailable"
          body="Browse the catalogue again to load this item."
        />
      ) : (
        <DiscoveryDetail item={item} />
      )}
    </SettingsFrame>
  );
}
function DiscoveryDetail({
  item,
}: {
  readonly item: NonNullable<ReturnType<typeof useDiscoveryItem>['data']>;
}): ReactNode {
  const mutation = useMutationState();
  const owner = useIsOwner();
  return (
    <View className="gap-section-gap">
      <Text variant="body" selectable>
        {item.description}
      </Text>
      <List inset>
        <ValueRow title="Publisher" value={item.publisher} />
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
      <Text variant="footnote" tone="variant">
        {item.acquisition.state === 'unsupported'
          ? item.acquisition.reason
          : 'Inspection checks the source and requirements before adding a skill.'}
      </Text>
      <DiscoveryAcquisition item={item} />
      {owner ? null : (
        <Text variant="footnote" tone="variant">
          Managed by the home owner
        </Text>
      )}
    </View>
  );
}

function DiscoveryAcquisition({
  item,
}: {
  readonly item: NonNullable<ReturnType<typeof useDiscoveryItem>['data']>;
}): ReactNode {
  const mutation = useMutationState();
  const client = useQueryClient();
  const router = useRouter();
  const owner = useIsOwner();
  const sync = useSyncStatus();
  const installed = useExtensions();
  const present =
    item.installed_id !== null &&
    installed.data?.items.some((entry) => entry.id === item.installed_id) === true;
  if (present && item.installed_id !== null)
    return <NavRow title="Installed skill or extension" href={extensionHref(item.installed_id)} />;
  if (item.acquisition.state !== 'available') return null;
  return (
    <List inset>
      <ActionRow
        title={mutation.busy ? 'Inspecting…' : 'Inspect skill'}
        disabled={!owner || sync.status !== 'live' || mutation.busy}
        onPress={() => {
          const acquisition = item.acquisition;
          if (acquisition.state !== 'available') return;
          mutation.run(
            () => api().call(E.resolveAiHarnessSkill, { body: { url: acquisition.url } }),
            {
              failure: 'Skill could not be inspected',
              onDone: (resolved) => {
                client.setQueryData([...RESOLVED_EXTENSION_KEY, resolved.id], resolved);
                router.push(extensionHref(resolved.id, undefined, true));
              },
            },
          );
        }}
      />
    </List>
  );
}
