import type { BrushLiveFrame, BrushStateView } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Badge } from '../../../components/badge';
import { cn } from '../../../design/cn';
import { atLeast, useSizeClass } from '../../../design/size-class';
import { MouthMap } from '../charts/mouth-map';
import { useFrame } from '../data/brush-data';
import { zoneStates, liveSteps } from '../model/stage-model';
import { ZONE_TEXT } from '../model/zone-text';
import { brandUi } from '../brands';
import { ModeChip } from './mode-chip';
import { PressureBadge } from './pressure-badge';
import { StepBar } from './step-bar';
import { DEFAULT_ROUTINE_S, TimerRing } from './timer-ring';

const MOUTH_PX = 168;
const RING_PX = 128;

function Readouts({
  frame,
  view,
}: {
  readonly frame: BrushLiveFrame;
  readonly view: BrushStateView;
}): ReactNode {
  const { brand } = view.profile;
  const { StageExtras } = brandUi(brand);
  return (
    <View className="min-w-0 gap-2">
      <View className="flex-row flex-wrap items-center gap-2">
        <ModeChip brand={brand} mode={frame.mode} />
        {frame.session === 'paused' ? <Badge label="Paused" tone="warning" /> : null}
        {frame.pressure === null ? null : <PressureBadge brand={brand} pressure={frame.pressure} />}
      </View>
      {StageExtras === null ? null : <StageExtras intensity={frame.intensity} />}
    </View>
  );
}

export function LiveStage({
  deviceId,
  view,
}: {
  readonly deviceId: string;
  readonly view: BrushStateView;
}): ReactNode {
  const frame = useFrame(deviceId, view.frame);
  const wide = atLeast(useSizeClass().width, 'medium');
  const routine = frame.routineS ?? DEFAULT_ROUTINE_S;
  const steps = liveSteps(frame, view.profile.zones, routine);
  return (
    <View className="gap-4">
      <View className={cn('items-center gap-4', wide && 'flex-row justify-center gap-8')}>
        {view.profile.zones === 0 ? null : (
          <MouthMap
            profile={view.profile}
            states={zoneStates(steps)}
            size={MOUTH_PX}
            label={ZONE_TEXT[frame.zoneSource].live}
          />
        )}
        <TimerRing frame={frame} size={RING_PX} />
        <Readouts frame={frame} view={view} />
      </View>
      <StepBar profile={view.profile} steps={steps} />
    </View>
  );
}
