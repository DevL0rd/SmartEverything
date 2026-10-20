import type { TreadmillStateView } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { background } from '@smarteverything/logging';
import { Button } from '../../../components/button';
import { Card } from '../../../components/card';
import { Text } from '../../../components/text';
import { useControl } from '../../../store/control';
import type { Device } from '../../../store/state';
import { useLiveSelect, useTreadmillDemand, useTreadmillState } from '../data/treadmill-data';
import { controlsOf, speedText } from '../model/treadmill-model';
import { speedInclineSentence } from '../model/widget-model';
import { InclineLine, useInclineReadout } from '../widgets/incline-readout';
import { StateBadge } from './state-badge';

function StripSpeed({
  deviceId,
  view,
}: {
  readonly deviceId: string;
  readonly view: TreadmillStateView;
}): ReactNode {
  const speed = useLiveSelect(deviceId, view.frame, (frame) => frame.belt.speedKmh);
  const readout = useInclineReadout({ deviceId, view });
  return (
    <View
      accessible
      accessibilityLabel={speedInclineSentence(speed, readout)}
      className="flex-row flex-wrap items-baseline gap-x-3 gap-y-1"
    >
      <Text variant="title-3" className="tabular">
        {speedText(speed)} km/h
      </Text>
      <InclineLine deviceId={deviceId} view={view} />
    </View>
  );
}

function StopButton({
  deviceId,
  view,
}: {
  readonly deviceId: string;
  readonly view: TreadmillStateView;
}): ReactNode {
  const control = useControl(deviceId, 'belt_command');
  const state = useLiveSelect(deviceId, view.frame, (frame) => frame.belt.state);
  if (!controlsOf(view, state).stop) {
    return null;
  }
  return (
    <Button
      label="Stop"
      icon="square"
      variant="destructive"
      onPress={() => {
        background(control.set('stop'), 'control.set_failed');
      }}
    />
  );
}

function Strip({
  deviceId,
  view,
}: {
  readonly deviceId: string;
  readonly view: TreadmillStateView;
}): ReactNode {
  return (
    <Card>
      <View className="flex-row flex-wrap items-center gap-3">
        <StateBadge deviceId={deviceId} view={view} />
        <View className="min-w-0 flex-1">
          <StripSpeed deviceId={deviceId} view={view} />
        </View>
        <StopButton deviceId={deviceId} view={view} />
      </View>
    </Card>
  );
}

export function BeltStrip({ device }: { readonly device: Device }): ReactNode {
  const state = useTreadmillState(device.id);
  useTreadmillDemand(device.id);
  return state.data === undefined ? null : <Strip deviceId={device.id} view={state.data} />;
}
