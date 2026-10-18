import { pluginLog, usePluginScreen } from '../shared/plugin-log';
import { ADGUARD_CLIENT_INFO, MAC_ADDRESS, type AdGuardClientInfo } from '@smarteverything/domain';
import { useScreenQuery } from '../../queries/use-screen-query';
import type { Href } from 'expo-router';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { z } from 'zod';
import { Badge } from '../../components/badge';
import { Banner } from '../../components/banner';
import { ListRow } from '../../components/list-row';
import { ValueRow } from '../../components/rows';
import { List } from '../../components/section';
import { Sheet } from '../../components/sheet';
import { Skeleton } from '../../components/skeleton';
import { Text } from '../../components/text';
import { decimal } from '../../format/number';
import { PLUGIN_PREFIX } from '../../queries/keys';
import { ServiceMedallion } from '../shared/service-medallion';
import { usePluginDevice } from '../shared/use-plugin-device';
import { parsePluginReply, readPluginTool } from '../use-plugin-tool';
import { ADGUARD_PLUGIN, useAdGuardSnapshot } from './adguard-data';
import { periodText } from './stats-period';
import { background } from '@smarteverything/logging';

const CLIENT_REPLY = z.strictObject({ client: ADGUARD_CLIENT_INFO });

const SOURCE_TEXT: Readonly<Record<AdGuardClientInfo['source'], string>> = {
  configured: 'Configured',
  detected: 'Detected',
  unknown: 'Unknown',
};

interface ClientInfoState {
  readonly info: AdGuardClientInfo | null;
  readonly failed: boolean;
  readonly retry: () => void;
}

function useClientInfo(client: string | null): ClientInfoState {
  const query = useScreenQuery({
    queryKey: [...PLUGIN_PREFIX, ADGUARD_PLUGIN, 'client', client],
    queryFn: async () => {
      const info = parsePluginReply(
        ADGUARD_PLUGIN,
        'client_info',
        CLIENT_REPLY,
        await readPluginTool(ADGUARD_PLUGIN, 'client_info', { client }),
      ).client;
      pluginLog.debug('plugin_query.fetched', {
        pluginId: ADGUARD_PLUGIN,
        query: 'client_info',
        source: info.source,
      });
      return info;
    },
    enabled: client !== null,
  });
  return {
    info: query.data ?? null,
    failed: query.isError,
    retry: (): void => {
      background(query.refetch(), 'query.refetch_failed');
    },
  };
}

function Chips({
  title,
  values,
}: {
  readonly title: string;
  readonly values: readonly string[];
}): ReactNode {
  return (
    <View className="min-h-row-h-2 gap-2 px-4 py-3">
      <Text variant="callout" tone="variant">
        {title}
      </Text>
      <View className="flex-row flex-wrap gap-2">
        {values.map((value) => (
          <Badge key={value} label={value} />
        ))}
      </View>
    </View>
  );
}

function yesNo(value: boolean): string {
  return value ? 'Yes' : 'No';
}

function Facts({ info }: { readonly info: AdGuardClientInfo }): ReactNode {
  const stream = useAdGuardSnapshot();
  const stats = stream.state === 'ready' ? stream.value.stats : null;
  return (
    <List>
      {info.ids.length === 0 ? null : <Chips title="Identifiers" values={info.ids} />}
      <ValueRow title="Source" value={SOURCE_TEXT[info.source]} />
      <ValueRow title="Own settings" value={yesNo(info.ownSettings)} />
      {info.filtering === null ? null : (
        <ValueRow title="Filtering" value={info.filtering ? 'On' : 'Off'} />
      )}
      <ValueRow
        title="Lookups"
        value={`${decimal(info.queriesInStats)} in the ${stats === null ? 'stats period' : periodText(stats)}`}
      />
      {info.blockedServices.length === 0 ? null : (
        <Chips title="Blocked services" values={info.blockedServices} />
      )}
    </List>
  );
}

function routerClientsHref(routerId: string, info: AdGuardClientInfo): Href {
  const mac = info.ids.map((id) => MAC_ADDRESS.safeParse(id)).find((parsed) => parsed.success);
  return {
    pathname: '/device/[deviceId]/[section]',
    params: {
      deviceId: routerId,
      section: 'clients',
      ...(mac === undefined ? {} : { mac: mac.data }),
    },
  };
}

function Actions({
  client,
  info,
  onShowLookups,
}: {
  readonly client: string;
  readonly info: AdGuardClientInfo;
  readonly onShowLookups: (search: string) => void;
}): ReactNode {
  const router = usePluginDevice('router');
  return (
    <List>
      <ListRow
        title="Show its lookups"
        icon="search"
        chevron
        onPress={() => {
          onShowLookups(info.ids.find((id) => z.ipv4().safeParse(id).success) ?? client);
        }}
      />
      {router === null ? null : (
        <ListRow
          title="Open in network devices"
          icon="router"
          chevron
          href={routerClientsHref(router.id, info)}
        />
      )}
    </List>
  );
}

function Lead({ info }: { readonly info: AdGuardClientInfo }): ReactNode {
  const text = `DNS client · ${SOURCE_TEXT[info.source]}`;
  return (
    <View className="flex-row items-center gap-3">
      <ServiceMedallion
        glyph="monitor"
        tone={info.source === 'configured' ? 'info' : 'neutral'}
        ratio={null}
        live={false}
        size="widget"
        label={text}
      />
      <Text variant="callout" tone="variant" className="flex-1">
        {text}
      </Text>
    </View>
  );
}

function Body({
  client,
  state,
  onShowLookups,
}: {
  readonly client: string;
  readonly state: ClientInfoState;
  readonly onShowLookups: (search: string) => void;
}): ReactNode {
  const { info, failed, retry } = state;
  if (failed) {
    return (
      <Banner
        tone="critical"
        title="This device could not be read"
        body="AdGuard Home did not answer."
        action={{ label: 'Try again', onPress: retry }}
      />
    );
  }
  if (info === null) {
    return <Skeleton shape="block" />;
  }
  return (
    <View className="gap-section-gap">
      <Lead info={info} />
      <Facts info={info} />
      <Actions client={client} info={info} onShowLookups={onShowLookups} />
    </View>
  );
}

export function ClientSheet({
  client,
  onClose,
  onShowLookups,
}: {
  readonly client: string | null;
  readonly onClose: () => void;
  readonly onShowLookups: (search: string) => void;
}): ReactNode {
  usePluginScreen('adguard', 'ClientSheet');
  const state = useClientInfo(client);
  return (
    <Sheet
      open={client !== null}
      onClose={onClose}
      title={state.info?.name ?? client ?? 'Device'}
      scroll
    >
      {client === null ? null : (
        <Body
          client={client}
          state={state}
          onShowLookups={(search) => {
            onClose();
            onShowLookups(search);
          }}
        />
      )}
    </Sheet>
  );
}
