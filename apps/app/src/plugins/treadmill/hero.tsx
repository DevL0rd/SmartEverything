import type { TreadmillStateView } from '@smarteverything/domain';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { Badge } from '../../components/badge';
import { Button } from '../../components/button';
import { Card } from '../../components/card';
import { LoadedQuery } from '../../components/loaded-query';
import { atLeast, useSizeClass } from '../../design/size-class';
import type { Device } from '../../store/state';
import { BeltVisual } from './components/belt-visual';
import { ControlPanels, SessionActions } from './components/belt-controls';
import { PowerSheet } from './components/power-sheet';
import { StateBadge } from './components/state-badge';
import { useLiveSelect, useTreadmillDemand, useTreadmillState } from './data/treadmill-data';
import { movingZone, signalWord, ZONE_LABEL } from './model/treadmill-model';

function ZoneBadge({
  deviceId,
  view,
}: {
  readonly deviceId: string;
  readonly view: TreadmillStateView;
}): ReactNode {
  const zone = useLiveSelect(deviceId, view.frame, (frame) => movingZone(frame.belt.speedKmh));
  return zone === null ? null : <Badge label={ZONE_LABEL[zone]} tone="primary" />;
}

function HeaderRow({
  deviceId,
  view,
  onPower,
}: {
  readonly deviceId: string;
  readonly view: TreadmillStateView;
  readonly onPower: () => void;
}): ReactNode {
  return (
    <View className="flex-row flex-wrap items-center justify-between gap-x-3 gap-y-2">
      <View className="min-w-0 flex-row flex-wrap items-center gap-2">
        <StateBadge deviceId={deviceId} view={view} />
        <ZoneBadge deviceId={deviceId} view={view} />
        {view.link.phase === 'linked' ? (
          <Badge label={`${signalWord(view.link.rssi)} signal`} tone="neutral" />
        ) : null}
      </View>
      <Button
        label="Power"
        icon="power"
        variant="tonal"
        hint="Opens the power options"
        onPress={onPower}
      />
    </View>
  );
}

function HeroCard({
  device,
  view,
}: {
  readonly device: Device;
  readonly view: TreadmillStateView;
}): ReactNode {
  const wide = atLeast(useSizeClass().width, 'medium');
  const [power, setPower] = useState(false);
  return (
    <Card>
      <View className="gap-4">
        <HeaderRow
          deviceId={device.id}
          view={view}
          onPower={() => {
            setPower(true);
          }}
        />
        <View className="items-center">
          <BeltVisual device={device} view={view} />
        </View>
        <SessionActions deviceId={device.id} view={view} />
        <ControlPanels deviceId={device.id} view={view} wide={wide} />
      </View>
      <PowerSheet
        deviceId={device.id}
        view={view}
        open={power}
        onClose={() => {
          setPower(false);
        }}
      />
    </Card>
  );
}

export function TreadmillHero({ device }: { readonly device: Device }): ReactNode {
  const state = useTreadmillState(device.id);
  useTreadmillDemand(device.id);
  return (
    <LoadedQuery query={state}>{(view) => <HeroCard device={device} view={view} />}</LoadedQuery>
  );
}
