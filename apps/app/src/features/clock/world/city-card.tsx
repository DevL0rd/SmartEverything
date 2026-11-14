import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Card } from '../../../components/card';
import { Figure } from '../../../components/figure';
import { Icon } from '../../../components/icon';
import { OverflowButton, type MenuItem } from '../../../components/menu';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { clock24 } from '../../../format/time';
import type { WorldCity } from './cities';
import { dayShareOf, daylightLineOf, daylightOf, type Daylight } from './daylight';
import { DaylightBar } from './daylight-bar';
import { dayWordOf, offsetToHomeOf, type DayWord } from './world-time';

export interface CityView {
  readonly city: WorldCity;
  readonly time: string;
  readonly offset: string;
  readonly day: DayWord;
  readonly daylight: Daylight;
  readonly now: number;
}

export function cityViewOf(city: WorldCity, now: number, homeZone: string): CityView {
  return {
    city,
    time: clock24(now, city.zone),
    offset: city.home ? 'Home' : offsetToHomeOf(now, city.zone, homeZone),
    day: dayWordOf(now, city.zone, homeZone),
    daylight: daylightOf(now, city.zone, city.point),
    now: dayShareOf(now, city.zone),
  };
}

function barLabelOf(view: CityView): string {
  const line = daylightLineOf(view.daylight);
  const at = `Daylight in ${view.city.name}, now ${view.time}`;
  return line === null ? at : `${at}. ${line}`;
}

function SunTimes({ daylight }: { readonly daylight: Daylight }): ReactNode {
  if (daylight.kind !== 'sun') {
    const line = daylightLineOf(daylight);
    return line === null ? null : (
      <Text variant="caption" tone="variant" numberOfLines={1}>
        {line}
      </Text>
    );
  }
  return (
    <View className="flex-row items-center justify-between">
      <View className="flex-row items-center gap-1">
        <Icon name="sunrise" size={12} tone="variant" />
        <Text variant="caption" tone="variant" className="tabular">
          {daylight.rise}
        </Text>
      </View>
      <View className="flex-row items-center gap-1">
        <Icon name="sunset" size={12} tone="variant" />
        <Text variant="caption" tone="variant" className="tabular">
          {daylight.set}
        </Text>
      </View>
    </View>
  );
}

function CityMenu({
  view,
  menu,
}: {
  readonly view: CityView;
  readonly menu: readonly MenuItem[];
}): ReactNode {
  return <OverflowButton items={menu} label={`${view.city.name} options`} />;
}

export function CityCard({
  view,
  menu,
}: {
  readonly view: CityView;
  readonly menu: readonly MenuItem[];
}): ReactNode {
  return (
    <Card>
      <View className="-my-2 flex-row items-center justify-between gap-2">
        <View className="min-w-0 flex-1 flex-row items-center gap-2">
          {view.city.home ? <Icon name="home" size={14} tone="primary" /> : null}
          <Text variant="label" numberOfLines={1} className="shrink">
            {view.city.name}
          </Text>
        </View>
        <Text variant="caption" tone="variant" className="tabular">
          {view.offset}
        </Text>
        <CityMenu view={view} menu={menu} />
      </View>
      <View className="flex-row items-baseline gap-2">
        <Figure value={view.time} size="l" />
        <Text variant="footnote" tone="variant">
          {view.day}
        </Text>
      </View>
      <DaylightBar
        spans={view.daylight.spans}
        now={view.now}
        label={barLabelOf(view)}
        slim={false}
      />
      <SunTimes daylight={view.daylight} />
    </Card>
  );
}

function rowOffsetOf(view: CityView): string {
  return view.day === 'Today' ? view.offset : `${view.offset}, ${view.day.toLowerCase()}`;
}

export function CityRow({
  view,
  menu,
  first,
}: {
  readonly view: CityView;
  readonly menu: readonly MenuItem[];
  readonly first: boolean;
}): ReactNode {
  return (
    <View className={cn('gap-2 px-card-pad py-3', !first && 'border-t border-outline-variant')}>
      <View className="flex-row items-center gap-3">
        <View className="min-w-0 flex-1">
          <Text variant="label" numberOfLines={1}>
            {view.city.name}
          </Text>
          <Text variant="caption" tone="variant" numberOfLines={1} className="tabular">
            {rowOffsetOf(view)}
          </Text>
        </View>
        <Figure value={view.time} size="m" />
        <CityMenu view={view} menu={menu} />
      </View>
      <DaylightBar spans={view.daylight.spans} now={view.now} label={barLabelOf(view)} slim />
    </View>
  );
}
