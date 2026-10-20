import type { ReactNode } from 'react';
import { View } from 'react-native';
import { LoadedQuery } from '../../components/loaded-query';
import type { Device } from '../../store/state';
import { LastSession } from './components/last-session';
import { TodayCard } from './components/today-card';
import { useBrushState, useFrameSelect } from './data/brush-data';
import { isBrushing } from './model/live-frame';
import type { BrushStateView } from '@smarteverything/domain';

function Body({
  deviceId,
  view,
}: {
  readonly deviceId: string;
  readonly view: BrushStateView;
}): ReactNode {
  const brushing = useFrameSelect(deviceId, view.frame, isBrushing);
  return (
    <View className="gap-section-gap">
      <TodayCard deviceId={deviceId} view={view} />
      {brushing ? null : <LastSession view={view} />}
    </View>
  );
}

export function BrushOverview({ device }: { readonly device: Device }): ReactNode {
  const state = useBrushState(device.id);
  return (
    <LoadedQuery query={state}>{(view) => <Body deviceId={device.id} view={view} />}</LoadedQuery>
  );
}
