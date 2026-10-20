import type { TreadmillStateView } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Banner } from '../../components/banner';
import { LoadedQuery } from '../../components/loaded-query';
import { Text } from '../../components/text';
import type { Device } from '../../store/state';
import { LastSession } from './components/last-session';
import { LiveBand } from './components/live-band';
import { TodayBand } from './components/today-band';
import { useTreadmillAct } from './data/treadmill-act';
import { useLiveSelect, useTreadmillState } from './data/treadmill-data';
import { motionOf } from './model/treadmill-model';

const BELT_FIGURE_NOTE =
  'Steps and distance are counted by the belt itself, so figures can differ from the daily step total.';

function Maintenance({
  deviceId,
  view,
}: {
  readonly deviceId: string;
  readonly view: TreadmillStateView;
}): ReactNode {
  const { act } = useTreadmillAct(deviceId);
  const { dueInDays } = view.maintenance;
  if (!view.mayConfigure || dueInDays === null || dueInDays > 0) {
    return null;
  }
  return (
    <Banner
      tone="warning"
      title="The belt is due for oil"
      body="Add 5 to 10 ml of silicone oil under the belt, then mark it done."
      wrapBody
      action={{
        label: 'Mark done',
        onPress: (): void => {
          act({ action: 'mark_lubricated' }, 'Could not mark the belt as oiled');
        },
      }}
    />
  );
}

function OverviewBody({
  deviceId,
  view,
}: {
  readonly deviceId: string;
  readonly view: TreadmillStateView;
}): ReactNode {
  const moving = useLiveSelect(
    deviceId,
    view.frame,
    (frame) => motionOf(frame.belt.state) === 'moving',
  );
  return (
    <View className="gap-section-gap">
      <Maintenance deviceId={deviceId} view={view} />
      {moving ? (
        <LiveBand deviceId={deviceId} view={view} />
      ) : (
        <LastSession deviceId={deviceId} session={view.lastSession} />
      )}
      <TodayBand deviceId={deviceId} />
      <Text variant="footnote" tone="faint">
        {BELT_FIGURE_NOTE}
      </Text>
    </View>
  );
}

export function TreadmillOverview({ device }: { readonly device: Device }): ReactNode {
  const state = useTreadmillState(device.id);
  return (
    <LoadedQuery query={state}>
      {(view) => <OverviewBody deviceId={device.id} view={view} />}
    </LoadedQuery>
  );
}
