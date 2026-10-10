import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import type {
  CapabilityRole,
  IrCodeRow,
  IrRemoteRow,
  PresentedCapability,
} from '@smarteverything/domain';
import { href } from '../../../app-shell/hrefs';
import { Button } from '../../../components/button';
import { Text } from '../../../components/text';
import { useIdiom } from '../../../design/platform';
import { useControl } from '../../../store/control';
import { useDeviceValues, useIrCodes } from '../../../store/selectors';
import type { Device } from '../../../store/state';
import { poweredOffReason } from '../controls/guard';
import { usePrimaryControls } from '../controls/primary-controls';
import { cardControls, settingControls } from '../model/card-facts';
import { powerStateOf, useDeviceModel } from '../model/device-model';
import { useRemotes } from '../remote/remote-section';
import { Facts } from './card-parts';
import { CompactControl, type LabelMode } from './compact-control';

const COLUMN_MIN = 240;
const GAP = 12;
const BUTTON_W = 112;
const FACT_H = { touch: 72, pointer: 56 } as const;
const FACT_W = 96;

interface Box {
  readonly width: number;
  readonly height: number;
}

function rowHeight(dense: boolean, pointer: boolean): number {
  if (dense) {
    return pointer ? 40 : 52;
  }
  return pointer ? 56 : 72;
}

function capacity(
  box: Box,
  row: number,
  column: number,
): { readonly columns: number; readonly total: number } {
  const columns = Math.max(1, Math.floor((box.width + GAP) / (column + GAP)));
  const rows = Math.max(0, Math.floor((box.height + GAP) / (row + GAP)));
  return { columns, total: columns * rows };
}

const NONE: ReadonlySet<CapabilityRole> = new Set();

function itemHeight(presented: PresentedCapability, dense: boolean, pointer: boolean): number {
  if (presented.capability.value.kind === 'boolean') {
    return pointer ? 36 : 48;
  }
  return rowHeight(dense, pointer);
}

function fitting(
  candidates: readonly PresentedCapability[],
  columns: number,
  height: number,
  heightOf: (presented: PresentedCapability) => number,
): readonly PresentedCapability[] {
  let used = -GAP;
  let count = 0;
  for (let start = 0; start < candidates.length; start += columns) {
    const row = candidates.slice(start, start + columns);
    const tallest = Math.max(...row.map(heightOf));
    if (used + GAP + tallest > height) {
      break;
    }
    used += GAP + tallest;
    count += row.length;
  }
  return candidates.slice(0, count);
}

function ControlGrid({
  device,
  controls,
  columns,
  width,
  labels,
  reason,
}: {
  readonly device: Device;
  readonly controls: readonly PresentedCapability[];
  readonly columns: number;
  readonly width: number;
  readonly labels: LabelMode;
  readonly reason: string | null;
}): ReactNode {
  const rows = Array.from({ length: Math.ceil(controls.length / columns) }, (_, row) =>
    controls.slice(row * columns, (row + 1) * columns),
  );
  return rows.map((row) => (
    <View key={row.map((presented) => presented.key).join('|')} className="flex-row gap-3">
      {row.map((presented) => (
        <View key={presented.key} className="min-w-0 flex-1">
          <CompactControl
            device={device}
            presented={presented}
            reason={reason}
            width={width}
            labels={labels}
          />
        </View>
      ))}
      {Array.from({ length: columns - row.length }, (_, gap) => (
        <View key={`gap-${String(gap)}`} className="flex-1" />
      ))}
    </View>
  ));
}

function CuratedControls({
  device,
  box,
  max,
  dense,
  labels = dense ? 'inline' : 'caption',
}: AreaProps & { readonly box: Box }): ReactNode {
  const inline = labels === 'inline';
  const model = useDeviceModel(device);
  const values = useDeviceValues(device.id);
  const pointer = useIdiom() === 'pointer';
  const off = powerStateOf(model, values) === 'off';
  const room = capacity(box, rowHeight(inline, pointer), COLUMN_MIN);
  const primary = cardControls(model.family, usePrimaryControls(device, NONE), max);
  const candidates = [...primary, ...settingControls(model)].slice(0, max);
  const controls = fitting(
    candidates,
    Math.max(1, Math.min(room.columns, candidates.length)),
    box.height,
    (presented) => itemHeight(presented, inline, pointer),
  );
  const columns = Math.max(1, Math.min(room.columns, controls.length));
  if (controls.length === 0 && !off) {
    return <NoControls device={device} box={box} dense={dense} />;
  }
  return (
    <View className="gap-3" pointerEvents="box-none">
      <ControlGrid
        device={device}
        controls={controls}
        columns={columns}
        width={(box.width - (columns - 1) * GAP) / columns}
        labels={labels}
        reason={off ? poweredOffReason(device.label) : null}
      />
    </View>
  );
}

function RemoteButtons({
  blaster,
  remote,
  count,
}: {
  readonly blaster: Device;
  readonly remote: IrRemoteRow;
  readonly count: number;
}): ReactNode {
  const codes = useIrCodes(remote.id).slice(0, count);
  const control = useControl(blaster.id, 'ir_send');
  const send = (code: IrCodeRow): void => {
    void control.set({ format: code.format, code: code.code });
  };
  return (
    <View className="flex-row flex-wrap gap-2">
      {codes.map((code) => (
        <Button
          key={code.id}
          label={code.button}
          variant="tonal"
          onPress={() => {
            send(code);
          }}
        />
      ))}
    </View>
  );
}

function QuickRemote({ device, box }: { readonly device: Device; readonly box: Box }): ReactNode {
  const { blaster, remotes } = useRemotes(device);
  const pointer = useIdiom() === 'pointer';
  const remote = remotes[0];
  const fit = capacity(box, rowHeight(true, pointer), BUTTON_W);
  if (blaster === null || fit.total === 0) {
    return null;
  }
  if (remote === undefined) {
    return (
      <View className="flex-row" pointerEvents="box-none">
        <Button
          label="Learn buttons"

          variant="tonal"
          href={href.settings.device(blaster.id, 'remotes')}
        />
      </View>
    );
  }
  return <RemoteButtons blaster={blaster} remote={remote} count={fit.total} />;
}

function NoControls({
  device,
  box,
  dense,
}: {
  readonly device: Device;
  readonly box: Box;
  readonly dense: boolean;
}): ReactNode {
  const { blaster } = useRemotes(device);
  const idiom = useIdiom();
  if (blaster !== null || !dense) {
    return <QuickRemote device={device} box={box} />;
  }
  const fit = capacity(box, FACT_H[idiom], FACT_W);
  if (fit.total === 0) {
    return null;
  }
  return <Facts device={device} hidden={NONE} max={fit.columns} column={false} large={false} />;
}

interface AreaProps {
  readonly device: Device;
  readonly max: number;
  readonly dense: boolean;
  readonly height?: number;
  readonly labels?: LabelMode;
}

export function ControlsArea({ device, max, dense, height, labels }: AreaProps): ReactNode {
  const model = useDeviceModel(device);
  const [measured, setBox] = useState<Box | null>(null);
  const offline = !device.online && !model.sleepy;
  const box =
    measured === null || height === undefined ? measured : { width: measured.width, height };
  return (
    <View
      className={height === undefined ? 'min-h-0 flex-1 overflow-hidden' : ''}
      pointerEvents="box-none"
      onLayout={(event) => {
        const layout = event.nativeEvent.layout;
        setBox({ width: Math.floor(layout.width), height: Math.floor(layout.height) });
      }}
    >
      {offline && !dense ? (
        <Text variant="callout" tone="variant" numberOfLines={2}>
          {'Not responding. Check that it’s plugged in and on Wi‑Fi.'}
        </Text>
      ) : null}
      {box === null || offline ? null : (
        <CuratedControls
          device={device}
          box={box}
          max={max}
          dense={dense}
          {...(labels === undefined ? {} : { labels })}
        />
      )}
    </View>
  );
}
