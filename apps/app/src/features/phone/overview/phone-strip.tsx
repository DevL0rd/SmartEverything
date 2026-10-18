import type { ReactNode } from 'react';
import type { Href } from 'expo-router';
import { href } from '../../../app-shell/hrefs';
import { MetricStrip, type MetricItem } from '../../../components/metric-strip';
import { bytes } from '../../../format/number';
import { hoursMinutes } from '../../../format/time';
import { useDeviceSeries } from '../../../queries/history';
import { sameJson } from '../../../store/same-json';
import { useDeviceDerived } from '../../../store/selectors';
import type { Device } from '../../../store/state';
import { usePhoneSection } from '../data/phone-detail';
import { isLow } from '../model/face-model';
import { phoneReadingsOf, type PhoneReadings } from '../phone-values';

const DAY_HOURS = 24;
const COLUMNS = { compact: 2, medium: 3, expanded: 6 } as const;
const SIGNAL_WORDS = ['None', 'Weak', 'Fair', 'Good', 'Great'] as const;

type StripReadings = Pick<
  PhoneReadings,
  'battery' | 'network' | 'notificationCount' | 'screenMinutes' | 'signalBars' | 'storageFree'
>;

function stripReadingsOf(readings: PhoneReadings): StripReadings {
  return {
    battery: readings.battery,
    network: readings.network,
    notificationCount: readings.notificationCount,
    screenMinutes: readings.screenMinutes,
    signalBars: readings.signalBars,
    storageFree: readings.storageFree,
  };
}

type Link = (page: string) => Href;

function batteryItem(
  readings: StripReadings,
  stale: boolean,
  to: Link,
  series: MetricItem['series'],
): MetricItem | null {
  if (readings.battery === null) return null;
  return {
    key: 'battery',
    label: 'Battery',
    value: String(readings.battery),
    unit: '%',
    stale,
    href: to('battery'),
    ...(isLow(readings) ? { tone: 'warning' as const } : {}),
    ...(series === undefined ? {} : { series }),
  };
}

function signalItem(readings: StripReadings, stale: boolean, to: Link): MetricItem {
  const word = readings.signalBars === null ? undefined : SIGNAL_WORDS[readings.signalBars];
  return {
    key: 'signal',
    label: 'Signal',
    value: stale || word === undefined ? '—' : word,
    stale,
    href: to('network'),
    ...(readings.network === null ? {} : { caption: readings.network }),
  };
}

interface PlainInput {
  readonly key: string;
  readonly label: string;
  readonly value: string | null;
  readonly stale: boolean;
  readonly target: Href;
  readonly caption?: string;
}

function plainItem({ key, label, value, stale, target, caption }: PlainInput): MetricItem | null {
  if (value === null) return null;
  return {
    key,
    label,
    value,
    stale,
    href: target,
    ...(caption === undefined ? {} : { caption }),
  };
}

function itemsOf(
  deviceId: string,
  readings: StripReadings,
  stale: boolean,
  series: MetricItem['series'],
): readonly MetricItem[] {
  const to: Link = (page) => href.settings.device(deviceId, page);
  const { screenMinutes, storageFree, notificationCount } = readings;
  return [
    batteryItem(readings, stale, to, series),
    signalItem(readings, stale, to),
    plainItem({
      key: 'screen',
      label: 'Screen time',
      value: screenMinutes === null ? null : hoursMinutes(screenMinutes),
      stale,
      target: to('screen'),
    }),
    plainItem({
      key: 'storage',
      label: 'Storage',
      value: storageFree === null ? null : bytes(storageFree),
      stale,
      target: to('storage'),
      caption: 'free',
    }),
    plainItem({
      key: 'notifications',
      label: 'Notifications',
      value: notificationCount === null ? null : String(notificationCount),
      stale,
      target: to('notifications'),
    }),
  ].filter((item) => item !== null);
}

export function PhoneStrip({ device }: { readonly device: Device }): ReactNode {
  const readings = useDeviceDerived(
    device.id,
    (values) => stripReadingsOf(phoneReadingsOf(values)),
    [],
    sameJson,
  );
  const series = useDeviceSeries(device.id, 'battery', DAY_HOURS).data;
  const data = usePhoneSection(device.id, 'network')?.data ?? null;
  const items = itemsOf(device.id, readings, !device.online, series);
  const withData =
    data === null
      ? items
      : [
          ...items,
          {
            key: 'data',
            label: 'Data today',
            value: bytes(data.today.wifiBytes + data.today.mobileBytes),
            caption: `${bytes(data.today.mobileBytes)} mobile`,
            stale: !device.online,
            href: href.settings.device(device.id, 'network', { part: 'data' }),
          },
        ];
  return <MetricStrip items={withData} columns={COLUMNS} />;
}
