import type { ReactNode } from 'react';
import {
  phoneCarCandidates,
  type PhoneCar,
  type PhoneNodeStatus,
} from '../../../modules/health-connect';
import { ListRow } from '../../components/list-row';
import { SelectRow } from '../../components/rows';
import { List } from '../../components/section';
import { rawErrorText } from '../../format/errors';
import { useScreenQuery } from '../../queries/use-screen-query';
import {
  allowAppUsage,
  allowNavigation,
  allowNotificationTitles,
  allowScreenTime,
  chooseCar,
  forgetCar,
  switchSensor,
} from './phone-permissions';
import { background } from '@smarteverything/logging';

const CAR_CANDIDATES_KEY = ['native', 'phone-car-candidates'] as const;

interface Status {
  readonly status: PhoneNodeStatus;
}

function ActivityRow({ status }: Status): ReactNode {
  const allowed = status.permissions.activity;
  const wanted = status.sensors.activity;
  const on = wanted && allowed;
  const blocked = wanted && !allowed;
  return (
    <ListRow
      title="Walking, cycling and driving"
      subtitle={
        blocked
          ? 'Off · Motion not allowed'
          : 'Uses Android’s motion detection. Nothing about where you are is used.'
      }
      subtitleTone={blocked ? 'warning' : 'variant'}
      icon="footprints"
      role="switch"
      checked={on}
      onPress={() => {
        background(switchSensor('activity', !on), 'sensor.switch_failed');
      }}
    />
  );
}

function useCarCandidates(): {
  readonly cars: readonly PhoneCar[] | undefined;
  readonly error: Error | null;
} {
  const query = useScreenQuery({
    queryKey: CAR_CANDIDATES_KEY,
    queryFn: phoneCarCandidates,
    staleTime: 0,
    refetchOnWindowFocus: true,
    retry: false,
  });
  return { cars: query.data, error: query.error };
}

function CarPicker(): ReactNode {
  const { cars, error } = useCarCandidates();
  if (cars === undefined || cars.length === 0) {
    return (
      <ListRow
        title="Car Bluetooth"
        subtitle={
          error === null
            ? 'Pair your car with this phone in Android’s Bluetooth settings first'
            : rawErrorText(error)
        }
        icon="car"
        disabled
      />
    );
  }
  return (
    <SelectRow
      title="Car Bluetooth"
      subtitle="Knows you’re driving when the phone connects to your car"
      icon="car"
      placeholder="Choose your car"
      options={cars.map((car) => ({
        value: car.address,
        label: car.name,
      }))}
      value={null}
      onChange={(address) => {
        background(chooseCar(address), 'car.choose_failed');
      }}
    />
  );
}

function CarRows({ status }: Status): ReactNode {
  if (!status.carSupported) {
    return <ListRow title="Car Bluetooth" value="Needs Android 13" icon="car" disabled />;
  }
  if (status.car === null) {
    return <CarPicker />;
  }
  const on = status.sensors.car;
  return (
    <>
      <ListRow
        title={`Car Bluetooth · ${status.car.name}`}
        subtitle="Knows you’re driving when the phone connects to your car"
        icon="car"
        role="switch"
        checked={on}
        onPress={() => {
          background(switchSensor('car', !on), 'sensor.switch_failed');
        }}
      />
      <ListRow
        title="Forget this car"
        icon="trash"
        destructive
        onPress={() => {
          background(forgetCar(), 'car.forget_failed');
        }}
      />
    </>
  );
}

function NavigationRow({ status }: Status): ReactNode {
  const on = status.sensors.navigation;
  if (!status.permissions.notificationAccess) {
    return (
      <ListRow
        title="Navigation"
        subtitle={
          on ? 'Off · Needs notification access' : 'Notices when Google Maps or Waze is guiding you'
        }
        subtitleTone={on ? 'warning' : 'variant'}
        icon="route"
        chevron
        onPress={() => {
          background(allowNavigation(), 'navigation.allow_failed');
        }}
      />
    );
  }
  return (
    <ListRow
      title="Navigation"
      subtitle="Notices when Google Maps or Waze is guiding you"
      icon="route"
      role="switch"
      checked={on}
      onPress={() => {
        background(switchSensor('navigation', !on), 'sensor.switch_failed');
      }}
    />
  );
}

function ScreenTimeRow({ status }: Status): ReactNode {
  const on = status.sensors.screen_time;
  if (!status.permissions.usageAccess) {
    return (
      <ListRow
        title="Screen time"
        subtitle={
          on
            ? 'Usage access is off'
            : 'Shows how long you’ve used your phone today. Android asks you to switch on Usage access.'
        }
        subtitleTone={on ? 'warning' : 'variant'}
        icon="timer"
        chevron
        onPress={() => {
          background(allowScreenTime(), 'screen_time.allow_failed');
        }}
      />
    );
  }
  return (
    <ListRow
      title="Screen time"
      subtitle="Shows how long you’ve used your phone today"
      icon="timer"
      role="switch"
      checked={on}
      onPress={() => {
        background(switchSensor('screen_time', !on), 'sensor.switch_failed');
      }}
    />
  );
}

function AppUsageRow({ status }: Status): ReactNode {
  const on = status.sensors.app_usage;
  if (!status.permissions.usageAccess) {
    return (
      <ListRow
        title="Share app usage"
        subtitle={
          on
            ? 'Off · App usage access is off'
            : 'Which apps you use. Only you see the names. Android asks you to switch on App usage access.'
        }
        subtitleTone={on ? 'warning' : 'variant'}
        icon="grid"
        chevron
        onPress={() => {
          background(allowAppUsage(), 'app_usage.allow_failed');
        }}
      />
    );
  }
  return (
    <ListRow
      title="Share app usage"
      subtitle="Which apps you use. Only you see the names."
      icon="grid"
      role="switch"
      checked={on}
      onPress={() => {
        background(switchSensor('app_usage', !on), 'sensor.switch_failed');
      }}
    />
  );
}

function NotificationTitlesRow({ status }: Status): ReactNode {
  const on = status.sensors.notification_titles;
  if (!status.permissions.notificationAccess) {
    return (
      <ListRow
        title="Share notification titles"
        subtitle={
          on
            ? 'Off · Needs notification access'
            : 'Off: only counts are shared. Message text is never shared. Android asks you to switch on notification access.'
        }
        subtitleTone={on ? 'warning' : 'variant'}
        icon="bell"
        chevron
        onPress={() => {
          background(allowNotificationTitles(), 'notification_titles.allow_failed');
        }}
      />
    );
  }
  return (
    <ListRow
      title="Share notification titles"
      subtitle="Off: only counts are shared. Message text is never shared."
      icon="bell"
      role="switch"
      checked={on}
      onPress={() => {
        background(switchSensor('notification_titles', !on), 'sensor.switch_failed');
      }}
    />
  );
}

export function SensorRows({ status }: Status): ReactNode {
  return (
    <List title="What it notices">
      <ActivityRow status={status} />
      <CarRows status={status} />
      <NavigationRow status={status} />
      <ScreenTimeRow status={status} />
      <AppUsageRow status={status} />
      <NotificationTitlesRow status={status} />
    </List>
  );
}
