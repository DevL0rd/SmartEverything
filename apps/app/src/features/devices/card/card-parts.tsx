import { useMemo, type ReactNode } from 'react';
import { View } from 'react-native';
import {
  airBand,
  type CapabilityRole,
  type HistoryRow,
  type PresentedCapability,
} from '@smarteverything/domain';
import { Sparkline, type ChartPoint } from '../../../components/charts';
import { Figure } from '../../../components/figure';
import { Icon, type IconName } from '../../../components/icon';
import { StatusChip } from '../../../components/status-chip';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { AIR_BAND_COLOUR } from '../../../design/data-colours';
import type { ColourRole } from '../../../design/tokens';
import { joinParts } from '../../../format/text';
import { useHistory } from '../../../queries/history';
import { memoOnInputs } from '../../../store/memo-selector';
import { useDeviceValues } from '../../../store/selectors';
import { useStoreSelector } from '../../../store/store-context';
import { deviceValuesOf, type Device, type DeviceValues } from '../../../store/state';
import { ColourShortcut } from '../controls/colour-shortcut';
import { PowerToggle } from '../controls/power-toggle';
import { splitUnit } from '../detail/device-hero';
import { useOfflineLine, useSeenLine } from '../detail/offline-banner';
import { cardFacts, levelText, targetText, type CardFact } from '../model/card-facts';
import { powerStateOf, useDeviceModel, type DeviceModel } from '../model/device-model';
import { heroReadingOf } from '../model/readings';
import { stateLine } from '../model/state-line';

const FACT_ICONS: Partial<Readonly<Record<CapabilityRole, IconName>>> = {
  pm25: 'airVent',
  pm10: 'airVent',
  temperature: 'thermometer',
  humidity: 'droplet',
  target_humidity: 'droplet',
  target_temperature: 'thermometer',
  filter_life: 'layers',
  water_level: 'glassWater',
  co2: 'cloud',
  power_draw: 'plug',
};

type NamesLook = 'large' | 'card' | 'tile' | 'line';

const BARE_STATES: ReadonlySet<string> = new Set(['On', 'Online']);

function stateText(model: DeviceModel, values: DeviceValues, reading: boolean): string {
  const state = stateLine(model, values, reading);
  const power = powerStateOf(model, values);
  if (power === 'off') {
    return state;
  }
  const doing = joinParts([levelText(model, values), targetText(model, values)]);
  if (doing === '') {
    return state;
  }
  return BARE_STATES.has(state)
    ? joinParts([power === 'on' ? 'On' : null, doing])
    : joinParts([state, doing]);
}

function asleepText(
  model: DeviceModel,
  values: DeviceValues,
  seen: string | null,
  look: NamesLook,
): string {
  const state = stateLine(model, values, false);
  return model.sleepy && look !== 'tile' && look !== 'line'
    ? joinParts([state, seen])
    : (seen ?? state);
}

function useNamesText(device: Device, model: DeviceModel, look: NamesLook): string {
  const offline = useOfflineLine(device.id);
  const seen = useSeenLine(device.id, look !== 'tile' && look !== 'line');
  const awake = device.online || model.sleepy;
  const select = useMemo(
    () =>
      memoOnInputs(
        (state) => [deviceValuesOf(state, device.id)],
        (state) => {
          const values = deviceValuesOf(state, device.id);
          return awake
            ? stateText(model, values, look !== 'large')
            : asleepText(model, values, look === 'large' ? offline : seen, look);
        },
      ),
    [device.id, model, awake, look, offline, seen],
  );
  return useStoreSelector(select);
}

function useIsOn(model: DeviceModel): boolean {
  return useStoreSelector(
    (state) => powerStateOf(model, deviceValuesOf(state, model.device.id)) === 'on',
    Object.is,
    [model],
  );
}

export function Names({
  device,
  look,
}: {
  readonly device: Device;
  readonly look: NamesLook;
}): ReactNode {
  const model = useDeviceModel(device);
  const text = useNamesText(device, model, look);
  const on = useIsOn(model);
  return (
    <View className="min-w-0 gap-0.5" pointerEvents="none">
      <Text
        variant={look === 'large' ? 'title-3' : 'body-strong'}
        numberOfLines={look === 'tile' ? 1 : 2}
      >
        {device.label}
      </Text>
      <Text
        variant="callout"
        tone={on ? 'primary' : 'variant'}
        numberOfLines={look === 'line' ? 2 : 1}
      >
        {text}
      </Text>
    </View>
  );
}

export function Corner({ device }: { readonly device: Device }): ReactNode {
  const model = useDeviceModel(device);
  if (!device.online && !model.sleepy) {
    return <StatusChip status="offline" />;
  }
  return (
    <View className="flex-row items-center">
      <ColourShortcut device={device} />
      <PowerToggle device={device} />
    </View>
  );
}

export function Header({
  device,
  large,
}: {
  readonly device: Device;
  readonly large: boolean;
}): ReactNode {
  return (
    <View className="flex-row items-start gap-2" pointerEvents="box-none">
      <View className="min-w-0 flex-1" pointerEvents="none">
        <Names device={device} look={large ? 'large' : 'card'} />
      </View>
      <Corner device={device} />
    </View>
  );
}

function FactChip({
  fact,
  stale,
  large,
}: {
  readonly fact: CardFact;
  readonly stale: boolean;
  readonly large: boolean;
}): ReactNode {
  const icon = (fact.role === null ? undefined : FACT_ICONS[fact.role]) ?? 'activity';
  return (
    <View className="min-w-24 gap-0.5 rounded-md bg-surface-2 px-3 py-2">
      <View className="flex-row items-center gap-1.5">
        <Icon name={icon} size={16} tone="variant" />
        <Text variant="caption" tone="variant" numberOfLines={1} className="shrink">
          {fact.label}
        </Text>
      </View>
      <Figure {...splitUnit(fact.text, fact.unit)} size={large ? 'm' : 's'} stale={stale} />
    </View>
  );
}

export function Facts({
  device,
  hidden,
  max,
  column,
  large,
}: {
  readonly device: Device;
  readonly hidden: ReadonlySet<CapabilityRole>;
  readonly max: number;
  readonly column: boolean;
  readonly large: boolean;
}): ReactNode {
  const model = useDeviceModel(device);
  const values = useDeviceValues(device.id);
  const off = powerStateOf(model, values) === 'off';
  const facts = cardFacts(model, values, hidden, off).slice(0, max);
  if (facts.length === 0 || (!device.online && !model.sleepy)) {
    return null;
  }
  return (
    <View className={cn('gap-2', !column && 'flex-row flex-wrap')} pointerEvents="none">
      {facts.map((fact) => (
        <FactChip key={fact.key} fact={fact} stale={!device.online || off} large={large} />
      ))}
    </View>
  );
}

const TREND_HOURS = 24;
const TREND_MIN_POINTS = 3;
const TREND_BUCKET_MS = 30 * 60_000;

function trendPoints(rows: readonly HistoryRow[], deviceId: string): readonly ChartPoint[] {
  const buckets = new Map<number, { readonly sum: number; readonly count: number }>();
  for (const row of rows) {
    if (row.device_id === deviceId && typeof row.value === 'number') {
      const start = Math.floor(Date.parse(row.observed_at) / TREND_BUCKET_MS) * TREND_BUCKET_MS;
      const bucket = buckets.get(start) ?? { sum: 0, count: 0 };
      buckets.set(start, { sum: bucket.sum + row.value, count: bucket.count + 1 });
    }
  }
  return [...buckets.entries()]
    .sort(([left], [right]) => left - right)
    .map(([start, bucket]) => ({ t: start + TREND_BUCKET_MS / 2, v: bucket.sum / bucket.count }));
}

const ROLE_COLOUR: Partial<Readonly<Record<CapabilityRole, ColourRole>>> = {
  humidity: 'humidity',
  temperature: 'temp-warm',
};

function trendColour(presented: PresentedCapability, latest: number | undefined): ColourRole {
  if (presented.role === 'pm25' && latest !== undefined) {
    return AIR_BAND_COLOUR[airBand(latest)];
  }
  return (presented.role === null ? undefined : ROLE_COLOUR[presented.role]) ?? 'viz-1';
}

function TrendLine({
  device,
  presented,
}: {
  readonly device: Device;
  readonly presented: PresentedCapability;
}): ReactNode {
  const history = useHistory([presented.key], TREND_HOURS);
  const points = history.isSuccess ? trendPoints(history.data, device.id) : [];
  if (points.length < TREND_MIN_POINTS) {
    return null;
  }
  return (
    <View className="w-full min-w-0 gap-1.5" pointerEvents="none">
      <View className="h-10 w-full">
        <Sparkline
          points={points}
          colour={trendColour(presented, points.at(-1)?.v)}
          height={40}
          area
        />
      </View>
      <Text variant="caption" tone="faint" numberOfLines={1}>
        {`${presented.label} · last 24 h`}
      </Text>
    </View>
  );
}

export function Trend({ device }: { readonly device: Device }): ReactNode {
  const model = useDeviceModel(device);
  const values = useDeviceValues(device.id);
  const hero = heroReadingOf(model, values);
  if (hero?.capability.value.kind !== 'number') {
    return null;
  }
  return <TrendLine device={device} presented={hero} />;
}
