import {
  BRUSH_INTENSITIES,
  BRUSH_MODE_LABELS,
  type BrushIntensity,
  type BrushMode,
  type BrushStateView,
} from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { SelectRow } from '../../../components/rows';
import { Segmented } from '../../../components/segmented';
import { Text } from '../../../components/text';
import { background } from '@smarteverything/logging';
import { useControl } from '../../../store/control';
import { useFrame } from '../../toothbrush/data/brush-data';
import { INTENSITY_LABEL, isBrushingNow, modeLabel } from '../../toothbrush/model/brush-model';

const INTENSITY_OPTIONS = BRUSH_INTENSITIES.map((value) => ({
  value,
  label: INTENSITY_LABEL[value],
}));

function ReadOnly({ view }: { readonly view: BrushStateView }): ReactNode {
  const { mode, intensity } = view.frame;
  const intensityWord = intensity === null ? 'not known' : INTENSITY_LABEL[intensity];
  return (
    <View className="gap-0.5">
      <Text variant="caption" tone="variant">
        On the handle
      </Text>
      <Text variant="callout" numberOfLines={2}>
        {modeLabel(mode)}, intensity {intensityWord}
      </Text>
    </View>
  );
}

function Picker({
  deviceId,
  view,
}: {
  readonly deviceId: string;
  readonly view: BrushStateView;
}): ReactNode {
  const modeControl = useControl(deviceId, 'brush_mode');
  const intensityControl = useControl(deviceId, 'brush_intensity');
  const frame = useFrame(deviceId, view.frame);
  const mode = frame.mode ?? view.availableModes[0] ?? 'clean';
  const intensity: BrushIntensity = frame.intensity ?? 'medium';
  return (
    <View className="gap-3">
      <SelectRow<BrushMode>
        title="Mode"
        icon="toothbrush"
        options={view.availableModes.map((value) => ({
          value,
          label: BRUSH_MODE_LABELS[value],
        }))}
        value={mode}
        onChange={(next) => {
          background(modeControl.set(next), 'control.set_failed');
        }}
      />
      <Segmented
        label="Intensity"
        options={INTENSITY_OPTIONS}
        value={intensity}
        onChange={(next) => {
          background(intensityControl.set(next), 'control.set_failed');
        }}
      />
    </View>
  );
}

export function HandleStrip({
  deviceId,
  view,
}: {
  readonly deviceId: string;
  readonly view: BrushStateView;
}): ReactNode {
  const frame = useFrame(deviceId, view.frame);
  if (isBrushingNow(frame.activity)) {
    return null;
  }
  if (!view.writes.allowed) {
    return <ReadOnly view={view} />;
  }
  return <Picker deviceId={deviceId} view={view} />;
}
