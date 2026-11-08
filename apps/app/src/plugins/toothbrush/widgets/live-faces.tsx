import type { BrushLiveFrame, BrushStateView } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Badge } from '../../../components/badge';
import { Text } from '../../../components/text';
import { useWidgetFace } from '../../../components/widget-board/use-widget-face';
import type { Device } from '../../../store/state';
import { cn } from '../../../design/cn';
import { BrushArt } from '../components/brush-visual';
import { WideArt, useWideArt } from '../../../features/devices/card/wide-card';
import { brandUi } from '../brands';
import { ModeChip } from '../components/mode-chip';
import { PressureBadge } from '../components/pressure-badge';
import { StepBar } from '../components/step-bar';
import { DEFAULT_ROUTINE_S, TimerRing } from '../components/timer-ring';
import { MouthMap } from '../charts/mouth-map';
import { useFrame } from '../data/brush-data';
import type { Step } from '../model/brush-model';
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
} from '../model/widget-model';
import { PrivateNote } from './private-note';

interface FaceProps {
  readonly device: Device;
  readonly view: BrushStateView;
  readonly frame: BrushLiveFrame;
}

function ZoneMap({
  view,
  frame,
  steps,
}: FaceProps & { readonly steps: readonly Step[] }): ReactNode {
  const art = useWideArt();
  if (view.profile.zones === 0) {
    return null;
  }
  return (
    <WideArt cls={art.cls}>
      <MouthMap
        profile={view.profile}
        states={zoneStates(steps)}
        size={art.px}
        label={ZONE_TEXT[frame.zoneSource].live}
      />
    </WideArt>
  );
}

function Brushing({ device, view, frame }: FaceProps): ReactNode {
  const { frame: box, cls } = useWidgetFace();
  const face = liveFaceOf(cls);
  const routine = frame.routineS ?? DEFAULT_ROUTINE_S;
  const steps = liveSteps(frame, view.profile.zones, routine);
  const { brand } = view.profile;
  const { StageExtras } = brandUi(brand);
  return (
    <View className={cn('flex-1 flex-row', cls === 'm' ? 'gap-3' : 'gap-4')}>
      {face === 'strip' ? null : (
        <ZoneMap device={device} view={view} frame={frame} steps={steps} />
      )}
      <View className="min-w-0 flex-1 flex-row gap-4">
        <TimerRing frame={frame} size={ringPxOf(bodyHeightOf(box))} />
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
    </View>
  );
}

function Resting({ device, view, frame }: FaceProps): ReactNode {
  const { cls } = useWidgetFace();
  const lines = cls === 'l' || cls === 'xl' ? 2 : 1;
  const recap = view.lastSession;
  const result = recap === null ? null : resultOf(recap);
  return (
    <View className={cn('flex-1 flex-row', cls === 'm' ? 'gap-3' : 'gap-4')}>
      <BrushArt device={device} view={view} />
      <View className="min-w-0 flex-1 gap-1">
        <Text variant="body-strong" numberOfLines={lines}>
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
        <Text variant="caption" tone="variant" numberOfLines={lines}>
          Battery {batteryWord(view)}
          {view.today === null
            ? ''
            : ` · ${String(view.today.counted)} of ${String(view.today.goalSessions)} today`}
        </Text>
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
