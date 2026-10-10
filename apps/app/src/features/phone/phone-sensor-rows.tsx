import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import {
  phoneCarCandidates,
  type PhoneCar,
  type PhoneNodeStatus,
} from '../../../modules/health-connect';
import { ListRow } from '../../components/list-row';
import { SelectRow } from '../../components/rows';
import { List } from '../../components/section';
import { rawErrorText } from '../../format/errors';
import {
  allowNavigation,
  allowScreenTime,
  chooseCar,
  forgetCar,
  switchSensor,
} from './phone-permissions';

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
      onPress={() => void switchSensor('activity', !on)}
    />
  );
}

type Candidates =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly cars: readonly PhoneCar[] }
  | { readonly kind: 'failed'; readonly reason: string };

function useCarCandidates(): Candidates {
  const [candidates, setCandidates] = useState<Candidates>({ kind: 'loading' });
  useEffect(() => {
    phoneCarCandidates().then(
      (cars) => {
        setCandidates({ kind: 'ready', cars });
      },
      (error: unknown) => {
        setCandidates({ kind: 'failed', reason: rawErrorText(error) });
      },
    );
  }, []);
  return candidates;
}

function CarPicker(): ReactNode {
  const candidates = useCarCandidates();
  if (candidates.kind !== 'ready' || candidates.cars.length === 0) {
    return (
      <ListRow
        title="Car Bluetooth"
        subtitle={
          candidates.kind === 'failed'
            ? candidates.reason
            : 'Pair your car with this phone in Android’s Bluetooth settings first'
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
      options={candidates.cars.map((car) => ({
        value: car.address,
        label: car.name,
      }))}
      value={null}
      onChange={(address) => void chooseCar(address)}
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
        onPress={() => void switchSensor('car', !on)}
      />
      <ListRow title="Forget this car" icon="trash" destructive onPress={() => void forgetCar()} />
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
        onPress={() => void allowNavigation()}
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
      onPress={() => void switchSensor('navigation', !on)}
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
        onPress={() => void allowScreenTime()}
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
      onPress={() => void switchSensor('screen_time', !on)}
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
    </List>
  );
}
