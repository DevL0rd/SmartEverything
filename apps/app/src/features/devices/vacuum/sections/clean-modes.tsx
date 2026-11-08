import { useMemo, type ReactNode } from 'react';
import { View } from 'react-native';
import type { JsonValue } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { Card } from '../../../../components/card';
import { Segmented } from '../../../../components/segmented';
import { Text } from '../../../../components/text';
import { useDeviceDerived } from '../../../../store/selectors';
import type { Device } from '../../../../store/state';
import { Guard, offlineReason } from '../../controls/guard';
import { useDeviceControl } from '../../controls/use-device-control';
import { useDeviceModel } from '../../model/device-model';
import { useDisplayName } from '../../model/display-name';
import {
  modeControlsOf,
  modesSummary,
  optionLabel,
  shownSegments,
  type ModeControl,
} from '../model/clean-modes';

function ModeRow({
  device,
  control,
  mode,
  reason,
}: {
  readonly device: Device;
  readonly control: ModeControl;
  readonly mode: JsonValue | undefined;
  readonly reason: string | null;
}): ReactNode {
  const live = useDeviceControl(device, control.presented);
  const segments = shownSegments(control, mode);
  const value = typeof live.value === 'string' ? live.value : '';
  return (
    <View className="gap-2">
      <View className="flex-row items-baseline justify-between gap-3">
        <Text variant="label">{control.title}</Text>
        <Text variant="footnote" tone="variant" numberOfLines={1} className="min-w-0 shrink">
          {optionLabel(control, live.value) ?? 'Not reported'}
        </Text>
      </View>
      <Guard reason={reason}>
        <Segmented
          label={control.presented.label}
          options={segments}
          value={value}
          fill
          disabled={reason !== null || live.pending}
          onChange={(next) => {
            background(live.set(next), 'vacuum.mode_set_failed');
          }}
        />
      </Guard>
      {control.note === null ? null : (
        <Text variant="footnote" tone="variant">
          {control.note}
        </Text>
      )}
    </View>
  );
}

function useReported(
  device: Device,
  controls: readonly ModeControl[],
): Readonly<Record<string, JsonValue | undefined>> {
  return useDeviceDerived(
    device.id,
    (values) =>
      Object.fromEntries(
        controls.map((control) => [control.presented.key, values[control.presented.key]?.value]),
      ),
    [controls],
  );
}

export function VacuumCleanModes({ device }: { readonly device: Device }): ReactNode {
  const { presentation } = useDeviceModel(device);
  const name = useDisplayName(device.id);
  const controls = useMemo(() => modeControlsOf(presentation), [presentation]);
  const reported = useReported(device, controls);
  if (controls.length === 0) {
    return null;
  }
  const modeKey = controls.find((control) => control.presented.role === 'vacuum_mode')?.presented
    .key;
  const mode = modeKey === undefined ? undefined : reported[modeKey];
  const reason = device.online ? null : offlineReason(name);
  return (
    <Card title="How it cleans" icon="vacuum">
      <View className="gap-5">
        <Text variant="footnote" tone="variant" accessibilityLiveRegion="polite">
          {modesSummary(controls, reported)}
        </Text>
        {controls.map((control) => (
          <ModeRow
            key={control.presented.key}
            device={device}
            control={control}
            mode={mode}
            reason={reason}
          />
        ))}
      </View>
    </Card>
  );
}
