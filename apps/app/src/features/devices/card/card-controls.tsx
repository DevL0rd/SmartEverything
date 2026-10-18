import type { ReactNode } from 'react';
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
import { useDeviceDerived, useIrCodes } from '../../../store/selectors';
import { shallowEqual } from '../../../store/store-context';
import type { Device } from '../../../store/state';
import { FAMILY_CONTROLS } from '../controls/family-controls';
import { poweredOffReason } from '../controls/guard';
import { primaryControlsOf } from '../controls/primary-controls';
import { LEVEL_ROLES, cardControls, settingControls } from '../model/card-facts';
import { columnCount, controlColumnMin } from '../model/control-columns';
import { powerStateOf, useDeviceModel } from '../model/device-model';
import { useRemotes } from '../remote/remote-section';
import { LevelControl } from '../faces/level-control';
import { Facts } from './card-parts';
import { CompactControl, type LabelMode } from './compact-control';
import { background } from '@smarteverything/logging';

const GAP = 12;
const BUTTON_W = 112;
const FACT_H = { touch: 72, pointer: 56 } as const;
const FACT_W = 96;
const LEVEL_BAR = 48;

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
  const columns = columnCount(box.width, column, GAP);
  const rows = Math.max(0, Math.floor((box.height + GAP) / (row + GAP)));
  return { columns, total: columns * rows };
}

const NONE: ReadonlySet<CapabilityRole> = new Set();

function itemHeight(presented: PresentedCapability, dense: boolean, pointer: boolean): number {
  if (
    presented.capability.value.kind === 'boolean' ||
    presented.capability.value.kind === 'action'
  ) {
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

function levelOf(
  controls: readonly PresentedCapability[],
  off: boolean,
): PresentedCapability | null {
  if (off) {
    return null;
  }
  return (
    controls.find(
      (presented) =>
        presented.capability.value.kind === 'number' &&
        presented.role !== null &&
        LEVEL_ROLES.has(presented.role),
    ) ?? null
  );
}

interface Plan {
  readonly level: PresentedCapability | null;
  readonly controls: readonly PresentedCapability[];
  readonly columns: number;
  readonly off: boolean;
}

interface PlanRead {
  readonly off: boolean;
  readonly primary: readonly PresentedCapability[];
}

function samePlanRead(left: PlanRead, right: PlanRead): boolean {
  return left.off === right.off && shallowEqual(left.primary, right.primary);
}

function usePlan(device: Device, box: Box, max: number, inline: boolean): Plan {
  const model = useDeviceModel(device);
  const pointer = useIdiom() === 'pointer';
  const read = useDeviceDerived(
    device.id,
    (values): PlanRead => ({
      off: powerStateOf(model, values) === 'off',
      primary: primaryControlsOf(model, values, NONE),
    }),
    [model],
    samePlanRead,
  );
  const { off } = read;
  const primary = cardControls(model.family, read.primary, max);
  const level = levelOf(primary, off);
  const fit: Box = {
    width: box.width,
    height: Math.max(0, box.height - (level === null ? 0 : LEVEL_BAR + GAP)),
  };
  const room = capacity(fit, rowHeight(inline, pointer), controlColumnMin(inline));
  const candidates = [...primary, ...settingControls(model)]
    .filter((presented) => presented !== level)
    .slice(0, max);
  const controls = fitting(
    candidates,
    Math.max(1, Math.min(room.columns, candidates.length)),
    fit.height,
    (presented) => itemHeight(presented, inline, pointer),
  );
  return { level, controls, columns: Math.max(1, Math.min(room.columns, controls.length)), off };
}

function StandardControls({
  device,
  box,
  max,
  dense,
  labels = dense ? 'inline' : 'caption',
}: AreaProps & { readonly box: Box }): ReactNode {
  const { level, controls, columns, off } = usePlan(device, box, max, labels === 'inline');
  if (controls.length === 0 && level === null && !off) {
    return <NoControls device={device} box={box} dense={dense} />;
  }
  return (
    <View className="gap-3" pointerEvents="box-none">
      {level === null ? null : (
        <LevelControl device={device} presented={level} label={`${device.label} ${level.label}`} />
      )}
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

function CuratedControls(props: AreaProps & { readonly box: Box }): ReactNode {
  const { device, box } = props;
  const Custom = FAMILY_CONTROLS[useDeviceModel(device).family]?.card;
  if (Custom === undefined) {
    return <StandardControls {...props} />;
  }
  return box.height < 72 ? (
    <Button label="Cooking" variant="tonal" href={href.deviceSection(device.id, 'controls')} />
  ) : (
    <Custom device={device} />
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
    background(control.set({ format: code.format, code: code.code }), 'control.set_failed');
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
  readonly labels?: LabelMode;
}

export function ControlsArea({
  device,
  box,
  max,
  dense,
  labels,
}: AreaProps & { readonly box: Box }): ReactNode {
  const model = useDeviceModel(device);
  const offline = !device.online && !model.sleepy;
  return (
    <View className="min-h-0 flex-1 overflow-hidden" pointerEvents="box-none">
      {offline && !dense ? (
        <Text variant="callout" tone="variant" numberOfLines={2}>
          {'Not responding. Check that it’s plugged in and on Wi‑Fi.'}
        </Text>
      ) : null}
      {offline || box.height <= 0 ? null : (
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
