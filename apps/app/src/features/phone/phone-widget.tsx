import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { WidgetSize } from '@smarteverything/domain';
import { href } from '../../app-shell/hrefs';
import { Button } from '../../components/button';
import { Text } from '../../components/text';
import {
  WidgetEmpty,
  WidgetFrame,
  WidgetStats,
  type WidgetDefinition,
  type WidgetStatProps,
} from '../../components/widget-board';
import { hoursMinutes, relative } from '../../format/time';
import { useMinute } from '../../store/clock';
import { useControl } from '../../store/control';
import { useDeviceValues } from '../../store/selectors';
import type { Device } from '../../store/state';
import { DeviceVisual } from '../device-visuals';
import { CONTEXT_TEXT } from './phone-context-text';
import { doingIcon, phoneReadingsOf, type PhoneReadings } from './phone-values';
import { useMyPhone } from './this-phone-device';

type Stat = WidgetStatProps & { readonly key: string };

function batteryStat(readings: PhoneReadings, battery: number, stale: boolean): Stat {
  return {
    key: 'battery',
    icon: 'battery',
    colour: 'positive',
    label: readings.charging ? 'Charging' : 'Battery',
    value: String(battery),
    unit: '%',
    tone: battery < 20 ? 'warning' : 'default',
    stale,
  };
}

function doingStat(readings: PhoneReadings, now: number, stale: boolean): Stat {
  const { doing } = readings;
  return {
    key: 'doing',
    icon: doing === null ? 'footprints' : doingIcon(doing),
    colour: 'primary',
    label: 'Doing',
    value: doing === null ? CONTEXT_TEXT.unknown : CONTEXT_TEXT[doing.state],
    ...(doing === null ? {} : { caption: relative(doing.at, now) }),
    stale,
  };
}

function statsOf(readings: PhoneReadings, now: number, stale: boolean): readonly Stat[] {
  const { battery, screenMinutes, network } = readings;
  const stats: Stat[] = [doingStat(readings, now, stale)];
  if (battery !== null) {
    stats.unshift(batteryStat(readings, battery, stale));
  }
  if (screenMinutes !== null) {
    stats.push({
      key: 'screen',
      icon: 'timer',
      colour: 'info',
      label: 'Screen time',
      value: hoursMinutes(screenMinutes),
      stale,
    });
  }
  if (network !== null) {
    stats.push({
      key: 'network',
      icon: 'wifi',
      colour: 'viz-2',
      label: 'Network',
      value: network,
      stale,
    });
  }
  return stats;
}

function Playing({ title }: { readonly title: string | null }): ReactNode {
  return title === null ? null : (
    <Text variant="callout" tone="variant" numberOfLines={1}>
      {`Playing · ${title}`}
    </Text>
  );
}

function RingButton({ phone }: { readonly phone: Device }): ReactNode {
  const ring = useControl(phone.id, 'ring');
  return (
    <Button
      label="Ring"
      icon="bell"
      variant="tonal"
      loading={ring.pending}
      disabled={ring.offline}
      onPress={() => void ring.set(null)}
    />
  );
}

function Body({ phone, size }: { readonly phone: Device; readonly size: WidgetSize }): ReactNode {
  const now = useMinute();
  const readings = phoneReadingsOf(useDeviceValues(phone.id));
  const stats = statsOf(readings, now, !phone.online);
  if (size === 'S') {
    return (
      <View className="flex-1 items-center justify-center gap-2">
        <DeviceVisual device={phone} size="card" />
        <Text variant="footnote" tone="variant" numberOfLines={1}>
          {readings.doing === null ? CONTEXT_TEXT.unknown : CONTEXT_TEXT[readings.doing.state]}
        </Text>
      </View>
    );
  }
  const wide = size === 'W';
  return (
    <View className="flex-1 justify-center gap-3">
      <WidgetStats stats={wide ? stats : stats.slice(0, 2)} columns={wide ? 4 : 2} />
      <Playing title={readings.nowPlaying} />
      {wide ? <RingButton phone={phone} /> : null}
    </View>
  );
}

function Battery({ phone }: { readonly phone: Device }): ReactNode {
  const { battery } = phoneReadingsOf(useDeviceValues(phone.id));
  return battery === null ? null : (
    <Text variant="footnote" tone={battery < 20 ? 'warning' : 'variant'} className="tabular">
      {`${String(battery)}%`}
    </Text>
  );
}

function PhoneWidget({ size }: { readonly size: WidgetSize }): ReactNode {
  const phone = useMyPhone();
  if (phone === null) {
    return (
      <WidgetFrame title="Phone" icon="smartphone" accent="primary" size={size}>
        <WidgetEmpty
          icon="smartphone"
          colour="primary"
          title="Share your phone"
          body="See its battery, what you’re doing and ring it from here."
          action={{ label: 'Set up', href: href.settings.page('this-phone') }}
          size={size}
        />
      </WidgetFrame>
    );
  }
  return (
    <WidgetFrame
      title={size === 'S' ? 'Phone' : phone.label}
      icon="smartphone"
      accent="primary"
      href={href.device(phone)}
      action={<Battery phone={phone} />}
      size={size}
    >
      <Body phone={phone} size={size} />
    </WidgetFrame>
  );
}

const SIZES = ['S', 'M', 'W'] as const;

export const PHONE_WIDGET: WidgetDefinition = {
  type: 'phone',
  title: 'Phone',
  icon: 'smartphone',
  sizes: { compact: SIZES, medium: SIZES, expanded: SIZES },
  defaultSize: 'M',
  render: ({ size }) => <PhoneWidget size={size} />,
};
