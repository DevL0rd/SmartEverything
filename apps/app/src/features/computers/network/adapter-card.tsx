import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { ComputerParts, InterfaceSnapshot } from '@smarteverything/domain';
import { Card } from '../../../components/card';
import { CopyButton } from '../../../components/copy-button';
import { IconWell } from '../../../components/icon-well';
import { SignalBars } from '../../../components/signal-bars';
import { Text } from '../../../components/text';
import { sameJson } from '../../../store/same-json';
import type { LiveLine } from '../components/live-series-chart';
import { LiveSeriesChart } from '../components/live-series-chart';
import { useComputerSelect } from '../data/computer-metrics';
import { byteRate } from '../model/computer-charts';
import {
  adapterLine,
  adapterState,
  addressLabel,
  ADAPTER_ICON,
  dbmOfPercent,
  showsTraffic,
} from './network-model';
import { RateFact } from './rate-fact';

const CHART_HEIGHT = 130;

interface AdapterFacts {
  readonly name: string;
  readonly kind: InterfaceSnapshot['kind'];
  readonly state: InterfaceSnapshot['state'];
  readonly speedMbps: number | null;
  readonly addresses: readonly string[];
  readonly dbm: number | null;
}

function factsOf(interfaces: readonly InterfaceSnapshot[], name: string): AdapterFacts | null {
  const found = interfaces.find((entry) => entry.name === name);
  if (found === undefined) return null;
  return {
    name: found.name,
    kind: found.kind,
    state: found.state,
    speedMbps: found.speedMbps,
    addresses: found.addresses,
    dbm: dbmOfPercent(found.signalPercent),
  };
}

function linesOf(name: string): readonly LiveLine[] {
  return [
    { ids: [`network/${name}.downloadRate`], label: 'Download', colour: 'viz-blue' },
    { ids: [`network/${name}.uploadRate`], label: 'Upload', colour: 'viz-magenta' },
  ];
}

function Addresses({ addresses }: { readonly addresses: readonly string[] }): ReactNode {
  return (
    <View className="gap-1">
      {addresses.map((address) => (
        <View key={address} className="min-h-touch-min flex-row items-center gap-2">
          <Text variant="caption" tone="variant" className="w-12">
            {addressLabel(address)}
          </Text>
          <Text variant="footnote" selectable className="min-w-0 flex-1 font-mono">
            {address}
          </Text>
          <CopyButton value={address} label={`Copy ${addressLabel(address)} address`} />
        </View>
      ))}
    </View>
  );
}

function rateOf(
  name: string,
  key: 'downloadRate' | 'uploadRate',
): (parts: ComputerParts) => number | null {
  return (parts: ComputerParts): number | null =>
    parts.network?.interfaces.find((entry) => entry.name === name)?.[key] ?? null;
}

function Traffic({
  deviceId,
  name,
  title,
  offline,
}: {
  readonly deviceId: string;
  readonly name: string;
  readonly title: string;
  readonly offline: boolean;
}): ReactNode {
  return (
    <>
      <View className="flex-row flex-wrap gap-x-6 gap-y-2">
        <RateFact
          deviceId={deviceId}
          label="Download"
          read={rateOf(name, 'downloadRate')}
          stale={offline}
        />
        <RateFact
          deviceId={deviceId}
          label="Upload"
          read={rateOf(name, 'uploadRate')}
          stale={offline}
        />
      </View>
      <LiveSeriesChart
        deviceId={deviceId}
        lines={linesOf(name)}
        yDomain="sticky"
        label={`${title} traffic`}
        formatValue={byteRate}
        height={CHART_HEIGHT}
        offline={offline}
      />
    </>
  );
}

function Header({
  title,
  facts,
}: {
  readonly title: string;
  readonly facts: AdapterFacts;
}): ReactNode {
  const state = adapterState(facts.state);
  return (
    <View className="flex-row items-center gap-3">
      <IconWell icon={ADAPTER_ICON[facts.kind]} colour="viz-blue" />
      <View className="min-w-0 flex-1">
        <Text variant="body-strong" numberOfLines={1}>
          {title}
        </Text>
        <Text variant="footnote" tone={state.tone}>
          {state.word}
        </Text>
      </View>
      {facts.kind === 'wifi' && facts.state === 'up' ? <SignalBars dbm={facts.dbm} /> : null}
    </View>
  );
}

export function AdapterCard({
  deviceId,
  name,
  title,
  offline,
}: {
  readonly deviceId: string;
  readonly name: string;
  readonly title: string;
  readonly offline: boolean;
}): ReactNode {
  const facts = useComputerSelect(
    deviceId,
    (parts) => factsOf(parts.network?.interfaces ?? [], name),
    sameJson,
  );
  if (facts === null) return null;
  return (
    <Card>
      <View className="gap-3">
        <Header title={title} facts={facts} />
        <Text variant="footnote" tone="variant">
          {adapterLine(facts)}
        </Text>
        {showsTraffic(facts) ? (
          <Traffic deviceId={deviceId} name={name} title={title} offline={offline} />
        ) : null}
        {facts.kind === 'vpn' ? (
          <Text variant="footnote" tone="variant">
            VPN connections show their state only. Turn them on or off on the computer.
          </Text>
        ) : null}
        <Addresses addresses={facts.addresses} />
      </View>
    </Card>
  );
}
