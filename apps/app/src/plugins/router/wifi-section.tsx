import type { RouterSnapshot } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Badge } from '../../components/badge';
import { EmptyState } from '../../components/empty-state';
import { ValueRow } from '../../components/rows';
import { List } from '../../components/section';
import { Skeleton } from '../../components/skeleton';
import { decimal, percent } from '../../format/number';
import { plural } from '../../format/text';
import { PluginNotice, StreamProblem } from '../shared/plugin-notice';
import { routerNotice, useRouterSnapshot } from './router-data';

type Radio = RouterSnapshot['radios'][number];

function RadioRows({ radio }: { readonly radio: Radio }): ReactNode {
  return (
    <>
      <ValueRow title="Devices" value={plural(radio.clients, 'device')} />
      {radio.channel === null ? null : (
        <ValueRow
          title="Channel"
          value={
            radio.width === null
              ? String(radio.channel)
              : `${String(radio.channel)} · ${radio.width}`
          }
        />
      )}
      {radio.airtimeBusyPercent === null ? null : (
        <ValueRow title="Airtime in use" value={percent(radio.airtimeBusyPercent / 100)} />
      )}
      {radio.noiseDbm === null ? null : (
        <ValueRow title="Noise" value={`${decimal(radio.noiseDbm)} dBm`} />
      )}
      {radio.temperatureCelsius === null ? null : (
        <ValueRow title="Radio temperature" value={`${decimal(radio.temperatureCelsius)} °C`} />
      )}
      {radio.dfs === null ? null : <ValueRow title="Radar check (DFS)" value={radio.dfs} />}
    </>
  );
}

function RadioList({ radio }: { readonly radio: Radio }): ReactNode {
  return (
    <List
      title={radio.ssid === null ? radio.band : `${radio.band} · ${radio.ssid}`}
      action={radio.enabled === false ? <Badge label="Off" tone="neutral" /> : null}
    >
      <RadioRows radio={radio} />
    </List>
  );
}

export function WifiSection(): ReactNode {
  const stream = useRouterSnapshot();
  if (stream.state === 'waiting') {
    return <Skeleton shape="block" />;
  }
  if (stream.state === 'invalid') {
    return <StreamProblem reason={stream.reason} />;
  }
  const { radios } = stream.value;
  return (
    <View className="gap-section-gap">
      <PluginNotice pluginId="router" notice={routerNotice(stream.value)} />
      {radios.length === 0 ? (
        <EmptyState
          icon="wifi"
          title="No Wi-Fi details yet"
          body="They appear after the router’s first full read."
        />
      ) : (
        radios.map((radio) => <RadioList key={radio.band} radio={radio} />)
      )}
    </View>
  );
}
