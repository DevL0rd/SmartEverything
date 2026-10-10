import type { RouterSnapshot } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Figure } from '../../components/figure';
import { IconButton } from '../../components/icon-button';
import { Text } from '../../components/text';
import type { BoardClass, WidgetDefinition, WidgetSize } from '../../components/widget-board';
import { decimal } from '../../format/number';
import { joinParts } from '../../format/text';
import { useProfiles } from '../../store/people';
import { PluginWidgetFrame } from '../shared/plugin-widget';
import { milliseconds } from '../shared/rate-format';
import { moment } from '../../format/time';
import { useMinute } from '../../store/clock';
import { summaryOf } from './speed-test-sheet';
import {
  routerNotice,
  useRouterDevice,
  useRouterSnapshot,
  useRouterTools,
  useSpeedTestRun,
  useSpeedTests,
} from './router-data';

const SIZES: Readonly<Record<BoardClass, readonly WidgetSize[]>> = {
  compact: ['S', 'M', 'L'],
  medium: ['S', 'M', 'L'],
  expanded: ['S', 'M', 'W', 'L'],
};

function offlineText(snapshot: RouterSnapshot): string | null {
  return routerNotice(snapshot)?.title ?? null;
}

function Throughput({
  network,
  size,
}: {
  readonly network: NonNullable<RouterSnapshot['network']>;
  readonly size: WidgetSize;
}): ReactNode {
  return (
    <View className="gap-2">
      <View className="flex-row gap-4">
        <Figure
          value={decimal(network.downloadMbps, 1)}
          unit="↓ Mb/s"
          size={size === 'S' ? 'm' : 'l'}
        />
        {size === 'S' ? null : (
          <Figure value={decimal(network.uploadMbps, 1)} unit="↑ Mb/s" size="l" />
        )}
      </View>
      <Text
        variant="footnote"
        tone={network.wanUp === false ? 'critical' : 'variant'}
        numberOfLines={1}
      >
        {network.wanUp === false
          ? 'Internet is down'
          : joinParts([
              'Connected',
              network.latencyMs === null ? null : milliseconds(network.latencyMs),
            ])}
      </Text>
    </View>
  );
}

function InternetWidget({ size }: { readonly size: WidgetSize }): ReactNode {
  return (
    <PluginWidgetFrame
      title="Internet"
      icon="globe"
      accent="primary"
      size={size}
      device={useRouterDevice()}
      stream={useRouterSnapshot()}
      unavailable={(snapshot) =>
        offlineText(snapshot) ?? (snapshot.network === null ? 'Waiting for the router…' : null)
      }
    >
      {(snapshot) =>
        snapshot.network === null ? null : <Throughput network={snapshot.network} size={size} />
      }
    </PluginWidgetFrame>
  );
}

function HomeWidget({ size }: { readonly size: WidgetSize }): ReactNode {
  const profiles = useProfiles();
  return (
    <PluginWidgetFrame
      title="Who’s home"
      icon="users"
      accent="positive"
      size={size}
      device={useRouterDevice()}
      stream={useRouterSnapshot()}
      unavailable={offlineText}
    >
      {(snapshot) => {
        const home = new Set(
          snapshot.clients.filter((client) => client.connected).map((client) => client.profileId),
        );
        const known = profiles.filter((profile) =>
          snapshot.clients.some((client) => client.profileId === profile.id),
        );
        return known.length === 0 ? (
          <Text variant="footnote" tone="variant" numberOfLines={3}>
            Say whose phone is whose on the router’s device list.
          </Text>
        ) : (
          <View className="gap-1">
            {known.map((profile) => (
              <Text
                key={profile.id}
                variant="callout"
                tone={home.has(profile.id) ? 'default' : 'faint'}
                numberOfLines={1}
              >
                {joinParts([profile.name, home.has(profile.id) ? 'Home' : 'Away'])}
              </Text>
            ))}
          </View>
        );
      }}
    </PluginWidgetFrame>
  );
}

function SpeedLine(): ReactNode {
  const run = useSpeedTestRun();
  const list = useSpeedTests(run.key);
  const now = useMinute();
  const last = list.state === 'ready' ? (list.tests[0] ?? null) : null;
  return (
    <View className="gap-1">
      <Text variant="callout" numberOfLines={2}>
        {run.running ? (run.line ?? 'Testing…') : last === null ? 'No test yet' : summaryOf(last)}
      </Text>
      {last === null || run.running ? null : (
        <Text variant="footnote" tone="variant" numberOfLines={1}>
          {moment(last.at, now)}
        </Text>
      )}
    </View>
  );
}

function SpeedWidget({ size }: { readonly size: WidgetSize }): ReactNode {
  const tools = useRouterTools();
  return (
    <PluginWidgetFrame
      title="Speed test"
      icon="gauge"
      accent="viz-2"
      size={size}
      device={useRouterDevice()}
      stream={useRouterSnapshot()}
      unavailable={offlineText}
      action={
        <IconButton
          icon="play"
          label="Run a speed test"
          onPress={() => void tools.run('run_speed_test', {})}
        />
      }
    >
      {() => <SpeedLine />}
    </PluginWidgetFrame>
  );
}

export const ROUTER_WIDGETS: readonly WidgetDefinition[] = [
  {
    type: 'router.internet',
    title: 'Internet',
    icon: 'globe',
    group: 'Network',
    sizes: SIZES,
    defaultSize: 'M',
    render: ({ size }) => <InternetWidget size={size} />,
  },
  {
    type: 'router.home',
    title: 'Who’s home',
    icon: 'users',
    group: 'Network',
    sizes: SIZES,
    defaultSize: 'M',
    render: ({ size }) => <HomeWidget size={size} />,
  },
  {
    type: 'router.speed',
    title: 'Speed test',
    icon: 'gauge',
    group: 'Network',
    sizes: SIZES,
    defaultSize: 'S',
    render: ({ size }) => <SpeedWidget size={size} />,
  },
];
