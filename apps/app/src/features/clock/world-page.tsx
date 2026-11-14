import { useRef, useState, type ReactNode } from 'react';
import { useWindowDimensions, View } from 'react-native';
import { centredRect, type Rect } from '../../components/anchor';
import { Button } from '../../components/button';
import { Card } from '../../components/card';
import { CardGrid, evenColumnsOf } from '../../components/card-grid';
import { EmptyState } from '../../components/empty-state';
import type { HeaderAction } from '../../components/page-header';
import { useAreaWidth } from '../../design/size-class';
import { clock24 } from '../../format/time';
import { useVisibleMinute } from '../planner/data';
import { Composer } from '../planner/item';
import { ClockFrame } from './frame/clock-frame';
import { frameLayoutOf } from './frame/sections';
import { AddCityPicker } from './world/add-city';
import { CityCard, CityRow, cityViewOf } from './world/city-card';
import { FindATimeCard, FindATimePhone } from './world/find-a-time-card';
import { eventTextAt } from './world/find-a-time';
import { useHourPick, useWorld, type WorldModel } from './world/use-world';

const ME = null;

function subtitleOf(world: WorldModel, now: number, compact: boolean): string {
  const count = world.clocks.length;
  const cities = `${String(count)} ${count === 1 ? 'city' : 'cities'}`;
  const head = `Home ${clock24(now, world.home.zone)} · ${cities}`;
  return compact ? head : `${head} · drag across the hours to find a time`;
}

function NoCities({
  onAdd,
  disabled,
}: {
  readonly onAdd: () => void;
  readonly disabled: boolean;
}): ReactNode {
  return (
    <EmptyState
      icon="globe"
      title="No other cities yet"
      body="Add the cities you call or work with to see their time, daylight and the best hour to meet."
      compact
      action={
        <Button label="Add city" icon="plus" variant="tonal" disabled={disabled} onPress={onAdd} />
      }
    />
  );
}

interface CitiesProps {
  readonly world: WorldModel;
  readonly now: number;
  readonly columns: number | null;
}

function Cities({ world, now, columns }: CitiesProps): ReactNode {
  const views = world.cities.map((city) => cityViewOf(city, now, world.home.zone));
  if (columns === null) {
    return (
      <Card padding="none">
        {views.map((view, index) => (
          <CityRow
            key={view.city.key}
            view={view}
            menu={world.menuOf(view.city)}
            first={index === 0}
          />
        ))}
      </Card>
    );
  }
  return (
    <CardGrid
      items={views}
      columns={evenColumnsOf(views.length, columns)}
      keyOf={(view) => view.city.key}
      render={(view) => <CityCard view={view} menu={world.menuOf(view.city)} />}
    />
  );
}

function columnsOf(area: number): number | null {
  const layout = frameLayoutOf(area);
  if (layout === 'compact') return null;
  return layout === 'wide' ? 3 : 2;
}

function FindATime({
  world,
  now,
  compact,
  onCreate,
}: {
  readonly world: WorldModel;
  readonly now: number;
  readonly compact: boolean;
  readonly onCreate: (text: string) => void;
}): ReactNode {
  const pick = useHourPick(now, world);
  if (world.plan === null) return null;
  const props = {
    cities: world.cities,
    home: world.home,
    plan: world.plan,
    pick,
    disabled: world.offline,
    onCreate: (): void => {
      onCreate(eventTextAt(pick.hour, world.home));
    },
  };
  return compact ? <FindATimePhone {...props} /> : <FindATimeCard {...props} />;
}

function addActionOf(open: () => void, offline: boolean): readonly HeaderAction[] {
  return [{ icon: 'plus', label: 'Add city', primary: true, disabled: offline, onPress: open }];
}

export function WorldPage(): ReactNode {
  const ref = useRef<View>(null);
  const { value: now, onLayout } = useVisibleMinute(ref);
  const world = useWorld(now);
  const window = useWindowDimensions();
  const columns = columnsOf(useAreaWidth());
  const [anchor, setAnchor] = useState<Rect | null>(null);
  const [event, setEvent] = useState<string | null>(null);
  const openAdd = (): void => {
    setAnchor(centredRect(window));
  };
  return (
    <ClockFrame
      section="world"
      subtitle={subtitleOf(world, now, columns === null)}
      actions={addActionOf(openAdd, world.offline)}
      width="dashboard"
    >
      <View ref={ref} onLayout={onLayout} className="gap-section-gap">
        <Cities world={world} now={now} columns={columns} />
        {world.clocks.length === 0 ? <NoCities onAdd={openAdd} disabled={world.offline} /> : null}
        <FindATime world={world} now={now} compact={columns === null} onCreate={setEvent} />
      </View>
      <AddCityPicker
        anchor={anchor}
        cities={world.cities}
        now={now}
        homeZone={world.home.zone}
        onAdd={world.add}
        onClose={() => {
          setAnchor(null);
        }}
      />
      <Composer
        open={event !== null}
        onClose={() => {
          setEvent(null);
        }}
        target="planner"
        person={ME}
        text={event ?? ''}
        kind="event"
        disabled={world.offline}
      />
    </ClockFrame>
  );
}
