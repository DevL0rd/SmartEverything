import { useRef, type ReactNode } from 'react';
import { View } from 'react-native';
import { ListRow } from '../../components/list-row';
import { List } from '../../components/section';
import { clock } from '../../format/time';
import { useSettings } from '../../store/selectors';
import { usePlannerPreferences, useVisibleMinute } from '../planner/data';
import { ClockFrame } from './frame/clock-frame';
import { cityOf } from './frame/rail-summary';

interface City {
  readonly key: string;
  readonly name: string;
  readonly zone: string;
  readonly home: boolean;
}

function useCities(): readonly City[] {
  const home = useSettings().time_zone;
  const clocks = usePlannerPreferences(null).data?.clock.world_clocks ?? [];
  return [
    { key: 'home', name: cityOf({ time_zone: home, label: null }), zone: home, home: true },
    ...clocks.map((world) => ({
      key: world.time_zone,
      name: cityOf(world),
      zone: world.time_zone,
      home: false,
    })),
  ];
}

export function WorldPage(): ReactNode {
  const ref = useRef<View>(null);
  const { value: now, onLayout } = useVisibleMinute(ref);
  const cities = useCities();
  return (
    <ClockFrame section="world">
      <View ref={ref} onLayout={onLayout}>
        <List>
          {cities.map((city) => (
            <ListRow
              key={city.key}
              icon={city.home ? 'home' : 'globe'}
              title={city.name}
              subtitle={city.home ? 'Home' : city.zone}
              value={clock(now, city.zone)}
            />
          ))}
        </List>
      </View>
    </ClockFrame>
  );
}
