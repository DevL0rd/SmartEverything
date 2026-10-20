import { maskedSerial, type BottleDiagnosticsView } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import { Button } from '../../../components/button';
import { Sparkline } from '../../../components/charts';
import { ListRow } from '../../../components/list-row';
import { LoadedQuery } from '../../../components/loaded-query';
import { ActionRow, ValueRow } from '../../../components/rows';
import { List } from '../../../components/section';
import { moment } from '../../../format/time';
import { useMinute } from '../../../store/clock';
import { useBottleAct } from '../data/bottle-act';
import { useBottleView } from '../data/bottle-data';
import { Anchored } from './anchored';

const SIGNAL_GOOD = 5000;
const SIGNAL_LOW = 1000;

function ReadRow({
  deviceId,
  title,
  action,
  reading,
  now,
}: {
  readonly deviceId: string;
  readonly title: string;
  readonly action: 'read_orientation' | 'read_sensors';
  readonly reading: { readonly text: string; readonly at: string } | null;
  readonly now: number;
}): ReactNode {
  const { act, busy } = useBottleAct(deviceId);
  return (
    <ListRow
      icon="gauge"
      title={title}
      subtitle={reading === null ? 'Not read yet' : `${reading.text}, ${moment(reading.at, now)}`}
      wrapSubtitle
      trailing={
        <Button
          label="Read"
          variant="tonal"
          loading={busy}
          onPress={() => {
            act({ action }, `Could not read ${title.toLowerCase()}`, true);
          }}
        />
      }
    />
  );
}

function Quality({ view }: { readonly view: BottleDiagnosticsView }): ReactNode {
  const { quality, signal } = view;
  const kcps = signal.kcps.map((value, index) => ({ t: index, v: value }));
  return (
    <List
      inset
      title="Readings"
      footer={`Signal strength: above ${String(SIGNAL_GOOD)} is good, below ${String(SIGNAL_LOW)} is weak.`}
    >
      <ValueRow icon="circleCheck" title="Accepted" value={String(quality.accepted)} />
      <ValueRow icon="list" title="Small changes" value={String(quality.small)} />
      <ValueRow icon="alert" title="Skipped" value={String(quality.rejected)} />
      <ValueRow icon="clock" title="Clock not trusted" value={String(quality.clockInvalid)} />
      {kcps.length >= 2 ? (
        <View className="px-4 py-3">
          <Sparkline points={kcps} colour="humidity" height={44} />
        </View>
      ) : null}
    </List>
  );
}

function DeviceCard({ view }: { readonly view: BottleDiagnosticsView }): ReactNode {
  const { device } = view;
  return (
    <List inset title="Device">
      <ValueRow icon="cpu" title="Model" value={device.model ?? 'Unknown'} />
      <ValueRow icon="info" title="Firmware" value={device.firmware ?? 'Unknown'} />
      <ValueRow icon="key" title="Serial" value={maskedSerial(device.serial)} />
      <ValueRow
        icon="clock"
        title="Clock drift"
        value={view.clockDriftSeconds === null ? 'Unknown' : `${String(view.clockDriftSeconds)} s`}
      />
      <ValueRow
        icon="signal"
        title="Signal"
        value={view.signal.rssi === null ? 'Unknown' : `${String(view.signal.rssi)} dBm`}
      />
    </List>
  );
}

function Lists({ view }: { readonly view: BottleDiagnosticsView }): ReactNode {
  return (
    <>
      {view.capSettings.length === 0 ? null : (
        <List inset title="Cap settings (read only)">
          {view.capSettings.map((setting) => (
            <ValueRow
              key={setting.label}
              icon="settings"
              title={setting.label}
              value={setting.value}
            />
          ))}
        </List>
      )}
      {view.unsupported.length === 0 ? null : (
        <List inset title="Not supported by this firmware">
          {view.unsupported.map((name) => (
            <ValueRow key={name} icon="alert" title={name} value="" />
          ))}
        </List>
      )}
    </>
  );
}

function Body({
  deviceId,
  view,
}: {
  readonly deviceId: string;
  readonly view: BottleDiagnosticsView;
}): ReactNode {
  const now = useMinute();
  return (
    <View className="gap-section-gap">
      <DeviceCard view={view} />
      <List inset title="Read now">
        <ReadRow
          deviceId={deviceId}
          title="Orientation"
          action="read_orientation"
          reading={view.orientation}
          now={now}
        />
        <ReadRow
          deviceId={deviceId}
          title="Cap sensors"
          action="read_sensors"
          reading={view.sensors.lid}
          now={now}
        />
      </List>
      <Quality view={view} />
      <Lists view={view} />
    </View>
  );
}

export function DiagnosticsList({ deviceId }: { readonly deviceId: string }): ReactNode {
  const [open, setOpen] = useState(false);
  const diagnostics = useBottleView(deviceId, 'diagnostics', {}, open);
  return (
    <View className="gap-section-gap">
      <List inset title="Diagnostics">
        <Anchored deviceId={deviceId} id="diagnostics" label="Diagnostics">
          <ActionRow
            icon="activity"
            title={open ? 'Hide diagnostics' : 'Show diagnostics'}
            subtitle="Signal, sensors, clock and cap settings, for troubleshooting"
            wrapSubtitle
            onPress={() => {
              setOpen((current) => !current);
            }}
          />
        </Anchored>
      </List>
      {open ? (
        <LoadedQuery query={diagnostics}>
          {(view) => <Body deviceId={deviceId} view={view} />}
        </LoadedQuery>
      ) : null}
    </View>
  );
}
