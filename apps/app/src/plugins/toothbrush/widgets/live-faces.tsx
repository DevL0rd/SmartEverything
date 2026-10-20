import type { BrushLiveFrame, BrushStateView } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Badge } from '../../../components/badge';
import { Text } from '../../../components/text';
import { useWidgetFace } from '../../../components/widget-board/use-widget-face';
import type { Device } from '../../../store/state';
import { BrushVisual } from '../components/brush-visual';
import { brandUi } from '../brands';
import { ModeChip } from '../components/mode-chip';
import { PressureBadge } from '../components/pressure-badge';
import { StepBar } from '../components/step-bar';
import { DEFAULT_ROUTINE_S, TimerRing } from '../components/timer-ring';
import { MouthMap } from '../charts/mouth-map';
import { useFrame } from '../data/brush-data';
import { liveSteps, stepCaption, zoneStates } from '../model/stage-model';
import { ZONE_TEXT } from '../model/zone-text';
import { resultOf, sessionLine } from '../model/session-model';
import {
  batteryWord,
  bodyHeightOf,
  liveCaption,
  liveFaceOf,
  liveKind,
  ringPxOf,
  visualPxOf,
  type LiveFace as FaceSize,
} from '../model/widget-model';
import { PrivateNote } from './private-note';

interface FaceProps {
  readonly device: Device;
  readonly view: BrushStateView;
  readonly frame: BrushLiveFrame;
}

const MAP_PX = { strip: 0, row: 96, panel: 144 } as const;

function Brushing({ view, frame }: FaceProps): ReactNode {
  const { frame: box } = useWidgetFace();
  const face = liveFaceOf(useWidgetFace().cls);
  const body = bodyHeightOf(box);
  const routine = frame.routineS ?? DEFAULT_ROUTINE_S;
  const steps = liveSteps(frame, view.profile.zones, routine);
  const { brand } = view.profile;
  const { StageExtras } = brandUi(brand);
  const map = MAP_PX[face];
  return (
    <View className="flex-1 flex-row items-center gap-4">
      {map === 0 || view.profile.zones === 0 ? null : (
        <MouthMap
          profile={view.profile}
          states={zoneStates(steps)}
          size={Math.min(map, body)}
          label={ZONE_TEXT[frame.zoneSource].live}
        />
      )}
      <TimerRing frame={frame} size={ringPxOf(body)} />
      <View className="min-w-0 flex-1 gap-2">
        <View className="flex-row flex-wrap items-center gap-2">
          <ModeChip brand={brand} mode={frame.mode} />
          {frame.pressure === null ? null : (
            <PressureBadge brand={brand} pressure={frame.pressure} />
          )}
        </View>
        {face === 'strip' ? (
          <Text variant="caption" tone="variant" numberOfLines={2}>
            {stepCaption(view.profile, steps)}
          </Text>
        ) : (
          <>
            {StageExtras === null ? null : <StageExtras intensity={frame.intensity} />}
            <StepBar profile={view.profile} steps={steps} />
          </>
        )}
      </View>
    </View>
  );
}

function Resting({ device, view, frame }: FaceProps): ReactNode {
  const { frame: box, cls } = useWidgetFace();
  const face: FaceSize = liveFaceOf(cls);
  const body = bodyHeightOf(box);
  const recap = view.lastSession;
  const result = recap === null ? null : resultOf(recap);
  return (
    <View className="flex-1 flex-row items-center gap-4">
      <BrushVisual device={device} view={view} size="card" px={visualPxOf(face, body)} />
      <View className="min-w-0 flex-1 gap-1">
        <Text variant="body-strong" numberOfLines={1}>
          {liveCaption(view, frame)}
        </Text>
        {result === null || recap === null ? null : (
          <View className="flex-row flex-wrap items-center gap-2">
            <Badge label={result.word} tone={result.tone} />
            <Text variant="caption" tone="variant" className="tabular">
              {sessionLine(recap)}
            </Text>
          </View>
        )}
        {face === 'strip' ? null : (
          <Text variant="caption" tone="variant">
            Battery {batteryWord(view)}
            {view.today === null
              ? ''
              : ` · ${String(view.today.counted)} of ${String(view.today.goalSessions)} today`}
          </Text>
        )}
      </View>
    </View>
  );
}

export function LiveFace({
  device,
  view,
}: {
  readonly device: Device;
  readonly view: BrushStateView;
}): ReactNode {
  const frame = useFrame(device.id, view.frame);
  const kind = liveKind(view, frame);
  const { WidgetFace } = brandUi(view.profile.brand);
  if (WidgetFace !== null && (kind === 'brushing' || kind === 'recap')) {
    return (
      <View className="flex-1" pointerEvents="box-none">
        <WidgetFace device={device} view={view} frame={frame} />
      </View>
    );
  }
  return (
    <View className="flex-1" pointerEvents="box-none">
      {kind === 'brushing' ? <Brushing device={device} view={view} frame={frame} /> : null}
      {kind === 'private' ? <PrivateNote view={view} /> : null}
      {kind === 'recap' || kind === 'asleep' ? (
        <Resting device={device} view={view} frame={frame} />
      ) : null}
    </View>
  );
}
