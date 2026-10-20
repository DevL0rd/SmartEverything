import type { BottleStatusView } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import { Bars } from '../../components/charts';
import { Banner } from '../../components/banner';
import { Button } from '../../components/button';
import { Card } from '../../components/card';
import { EmptyState } from '../../components/empty-state';
import { LoadedQuery } from '../../components/loaded-query';
import { Text } from '../../components/text';
import { cn } from '../../design/cn';
import { atLeast, useSizeClass } from '../../design/size-class';
import { minutesOfDay } from '../../format/time';
import { useMinute } from '../../store/clock';
import type { Device } from '../../store/state';
import { DayChart } from './charts/day-chart';
import { useBottleStatus } from './data/bottle-data';
import { isStale } from './model/bottle-model';
import { hourBars, peakHour } from './model/day-model';
import { DrinkRows } from './components/drink-rows';
import { FaultCard } from './components/fault-card';
import { WATER_COLOUR } from './model/bottle-colours';

function Hours({ view }: { readonly view: BottleStatusView }): ReactNode {
  const { today } = view;
  const highlight = peakHour(today);
  return (
    <Card title="Water by hour" icon="clock">
      <Bars
        bars={hourBars(today)}
        colour={WATER_COLOUR}
        label="Water drunk in each hour of today from all sources"
        {...(highlight === undefined ? {} : { highlightKey: highlight })}
      />
    </Card>
  );
}

function Today({ view }: { readonly view: BottleStatusView }): ReactNode {
  const now = useMinute();
  const stale = isStale(view, now);
  const { today } = view;
  const empty = today.drinks.length === 0 && today.fills.length === 0;
  return (
    <Card title="Today" icon="droplet">
      {stale ? (
        <Text variant="callout" tone="variant">
          Nothing from the bottle today.
        </Text>
      ) : empty ? (
        <EmptyState
          compact
          icon="glassWater"
          title="No drinks yet"
          body="Drinks appear here after the bottle wakes and syncs."
        />
      ) : (
        <DayChart today={today} body={view.body} nowMinute={minutesOfDay(now)} />
      )}
    </Card>
  );
}

const DRINKS_SHOWN = 6;

function Drinks({ view }: { readonly view: BottleStatusView }): ReactNode {
  const [all, setAll] = useState(false);
  const { drinks, fills } = view.today;
  const rows = [...drinks, ...fills].sort(
    (left, right) => Date.parse(right.at) - Date.parse(left.at),
  );
  const shown = all ? rows : rows.slice(0, DRINKS_SHOWN);
  return rows.length === 0 ? null : (
    <Card title="Drinks today" icon="glassWater">
      <DrinkRows drinks={shown} />
      {rows.length > DRINKS_SHOWN ? (
        <Button
          label={all ? 'Show fewer' : `Show all ${String(rows.length)}`}
          variant="text"
          onPress={() => {
            setAll(!all);
          }}
        />
      ) : null}
    </Card>
  );
}

function Body({ view }: { readonly view: BottleStatusView }): ReactNode {
  const wide = atLeast(useSizeClass().width, 'medium');
  return (
    <View className="gap-section-gap">
      {view.lastSyncOutcome !== null &&
      view.lastSyncOutcome !== 'ok' &&
      view.lastSyncDetail !== null ? (
        <Banner
          tone="warning"
          title="The last sync did not finish"
          body={view.lastSyncDetail}
          wrapBody
        />
      ) : null}
      <FaultCard deviceId={view.deviceId} fault={view.cap.fault} />
      <Today view={view} />
      {view.today.drinks.length === 0 && view.today.fills.length === 0 ? null : (
        <View className={cn('gap-section-gap', wide && 'flex-row items-start')}>
          <View className={cn(wide && 'min-w-0 flex-1')}>
            <Drinks view={view} />
          </View>
          <View className={cn(wide && 'min-w-0 flex-1')}>
            <Hours view={view} />
          </View>
        </View>
      )}
    </View>
  );
}

export function BottleOverview({ device }: { readonly device: Device }): ReactNode {
  const status = useBottleStatus(device.id);
  return <LoadedQuery query={status}>{(view) => <Body view={view} />}</LoadedQuery>;
}
