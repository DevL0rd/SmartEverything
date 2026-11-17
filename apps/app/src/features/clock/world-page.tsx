import { useRef, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { centredRect, type Rect } from '../../components/anchor';
import { Card } from '../../components/card';
import { CardGrid, evenColumnsOf } from '../../components/card-grid';
import { EmptyState } from '../../components/empty-state';
import type { ShellAction } from '../../components/page-shell/shell-actions';
import { useAreaWidth, useWindowSize } from '../../design/size-class';
import { useSettings } from '../../store/selectors';
import { useVisibleMinute, Composer, QueryBody } from '../planner';
import { ClockFrame } from './frame/clock-frame';
import { shellLayoutOf } from '../../components/page-shell/layout';
import { AddCityPicker } from './world/add-city';
import { CityCard, CityRow, cityViewOf } from './world/city-card';
import { FindATimeCard, FindATimePhone } from './world/find-a-time-card';
import { useClockFormat, useInstantClock } from './format/clock-format';
import { eventTextAt } from './world/find-a-time';
import type { PlannerPreferences } from '@smarteverything/domain';
import { useHourPick, useWorld, type WorldModel } from './world/use-world';

const ME = null;

function subtitleOf(prefs: PlannerPreferences | undefined, head: string, compact: boolean): string {
  if (prefs === undefined) return head;
  const count = prefs.clock.world_clocks.length;
  const cities = `${head} · ${String(count)} ${count === 1 ? 'city' : 'cities'}`;
  return compact ? cities : `${cities} · drag across the hours to find a time`;
}

function NoCities(): ReactNode {
  return (
    <Card>
      <EmptyState
        icon="globe"
        title="No other cities yet"
        body="Add the cities you call or work with to see their time, daylight and the best hour to meet."
        compact
      />
    </Card>
  );
}

interface CitiesProps {
  readonly world: WorldModel;
  readonly now: number;
  readonly columns: number | null;
}

type CitySlot =
  | { readonly kind: 'city'; readonly view: ReturnType<typeof cityViewOf> }
  | { readonly kind: 'empty' };

function slotKeyOf(slot: CitySlot): string {
  return slot.kind === 'city' ? slot.view.city.key : 'empty';
}

function Cities({ world, now, columns }: CitiesProps): ReactNode {
  const instant = useInstantClock();
  const views = world.cities.map((city) => cityViewOf(city, now, world.home.zone, instant));
  const empty = world.clocks.length === 0;
  if (columns === null) {
    return (
      <>
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
        {empty ? <NoCities /> : null}
      </>
    );
  }
  const slots: readonly CitySlot[] = [
    ...views.map((view) => ({ kind: 'city' as const, view })),
    ...(empty ? [{ kind: 'empty' as const }] : []),
  ];
  return (
    <CardGrid
      items={slots}
      columns={evenColumnsOf(slots.length, columns)}
      keyOf={slotKeyOf}
      render={(slot) =>
        slot.kind === 'city' ? (
          <CityCard view={slot.view} menu={world.menuOf(slot.view.city)} />
        ) : (
          <NoCities />
        )
      }
    />
  );
}

function columnsOf(area: number): number | null {
  const layout = shellLayoutOf(area);
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
  const format = useClockFormat();
  const props = {
    cities: world.cities,
    home: world.home,
    plan: world.plan,
    pick,
    disabled: world.offline,
    onCreate: (): void => {
      onCreate(eventTextAt(pick.hour, world.home, format));
    },
  };
  return compact ? <FindATimePhone {...props} /> : <FindATimeCard {...props} />;
}

function addActionOf(open: () => void, offline: boolean): readonly ShellAction[] {
  return [{ icon: 'plus', label: 'Add city', primary: true, disabled: offline, onPress: open }];
}

function WorldBody({
  world,
  now,
  columns,
  anchor,
  onCloseAdd,
  onCreate,
}: {
  readonly world: WorldModel;
  readonly now: number;
  readonly columns: number | null;
  readonly anchor: Rect | null;
  readonly onCloseAdd: () => void;
  readonly onCreate: (text: string) => void;
}): ReactNode {
  return (
    <View className="gap-section-gap">
      <Cities world={world} now={now} columns={columns} />
      <FindATime world={world} now={now} compact={columns === null} onCreate={onCreate} />
      <AddCityPicker
        anchor={anchor}
        cities={world.cities}
        now={now}
        homeZone={world.home.zone}
        onAdd={world.add}
        onClose={onCloseAdd}
      />
    </View>
  );
}

export function WorldPage(): ReactNode {
  const ref = useRef<View>(null);
  const { value: now, onLayout } = useVisibleMinute(ref);
  const world = useWorld(now);
  const window = useWindowSize();
  const columns = columnsOf(useAreaWidth());
  const [anchor, setAnchor] = useState<Rect | null>(null);
  const [event, setEvent] = useState<string | null>(null);
  const zone = useSettings().time_zone;
  const instant = useInstantClock();
  const loaded = world.query.data !== undefined;
  const openAdd = (): void => {
    setAnchor(centredRect(window));
  };
  return (
    <ClockFrame
      section="world"
      subtitle={subtitleOf(world.query.data, `Home ${instant(now, zone)}`, columns === null)}
      actions={addActionOf(openAdd, world.offline || !loaded)}
    >
      <View ref={ref} onLayout={onLayout}>
        <QueryBody query={world.query}>
          {(prefs) => (
            <WorldBody
              world={world.worldOf(prefs)}
              now={now}
              columns={columns}
              anchor={anchor}
              onCloseAdd={() => {
                setAnchor(null);
              }}
              onCreate={setEvent}
            />
          )}
        </QueryBody>
      </View>
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
