import type { BrushLiveFrame, BrushStateView } from '@smarteverything/domain';
import { useRef, type ReactNode } from 'react';
import { View } from 'react-native';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { useOnScreenGate } from '../../../design/visibility';
import { useMeasuredWidth } from '../../../components/use-measured-width';
import { ModeChip } from '../../toothbrush/components/mode-chip';
import { TimerRing } from '../../toothbrush/components/timer-ring';
import { useFrame } from '../../toothbrush/data/brush-data';
import { QuadrantArch, QuarterNotes } from '../charts/quadrant-arch';
import { widthStyle } from '../charts/style';
import { useOralbSettings } from '../data/use-oralb';
import { useForceTrace } from '../data/use-trace';
import { ARCH_CAPTION, ARCH_CAPTION_PACER_OFF, archLabel, centreLines } from '../model/arch-model';
import { bandsOf } from '../model/gauge-model';
import {
  TONGUE_NOTE,
  layoutOf,
  liveQuarters,
  pacerOn,
  sectionCaption,
  sectionsOf,
  stageKindOf,
  type StageLayout,
} from '../model/stage-model';
import { angleOf, modeBlurb } from '../model/wave-model';
import { HandleBox } from './handle-box';
import { PressureRow } from './pressure-row';
import { SectionStrip } from './section-strip';
import { SourceRow } from './source-row';
import { WaveRow } from './wave-row';

function Quarters({
  frame,
  view,
  layout,
  moving,
}: {
  readonly frame: BrushLiveFrame;
  readonly view: BrushStateView;
  readonly layout: StageLayout;
  readonly moving: boolean;
}): ReactNode {
  const quarters = liveQuarters(view, frame);
  const lines = centreLines({
    elapsedS: frame.elapsedS,
    routineS: frame.routineS,
    current: frame.zone,
    finished: false,
    quarters,
  });
  const on = pacerOn(view);
  return (
    <View className="gap-2" style={widthStyle(layout.archPx)}>
      <QuadrantArch
        quarters={quarters}
        big={lines.big}
        small={lines.small}
        width={layout.archPx}
        moving={moving}
        label={archLabel(quarters, false)}
      />
      <QuarterNotes quarters={quarters} />
      <Text variant="caption" tone="faint">
        {on ? ARCH_CAPTION : ARCH_CAPTION_PACER_OFF}
      </Text>
    </View>
  );
}

function Timed({
  frame,
  view,
  layout,
}: {
  readonly frame: BrushLiveFrame;
  readonly view: BrushStateView;
  readonly layout: StageLayout;
}): ReactNode {
  const kind = stageKindOf(view, frame);
  const strip = sectionsOf(view, frame);
  return (
    <View className="items-center gap-3" style={widthStyle(layout.archPx)}>
      <TimerRing frame={frame} size={128} />
      {kind === 'sections' ? (
        <SectionStrip count={strip.count} current={strip.current} caption={sectionCaption(strip)} />
      ) : (
        <Text variant="footnote" tone="variant" align="center">
          {TONGUE_NOTE}
        </Text>
      )}
    </View>
  );
}

function Mode({ frame }: { readonly frame: BrushLiveFrame }): ReactNode {
  const blurb = modeBlurb(frame.mode, angleOf(frame, frame.liveSource === 'link'));
  return (
    <View className="flex-row flex-wrap items-center gap-x-3 gap-y-1">
      <ModeChip brand="oralb" mode={frame.mode} />
      {blurb === null ? null : (
        <Text variant="footnote" tone="variant">
          {blurb}
        </Text>
      )}
      {frame.session === 'paused' ? (
        <Text variant="footnote" tone="warning">
          Paused
        </Text>
      ) : null}
    </View>
  );
}

function Details({
  frame,
  view,
  layout,
  moving,
  deviceId,
}: {
  readonly frame: BrushLiveFrame;
  readonly view: BrushStateView;
  readonly layout: StageLayout;
  readonly moving: boolean;
  readonly deviceId: string;
}): ReactNode {
  const bands = bandsOf(useOralbSettings(deviceId).forceBands);
  const samples = useForceTrace(frame);
  return (
    <View className="min-w-0 flex-1 gap-4">
      <Mode frame={frame} />
      <PressureRow
        frame={frame}
        view={view}
        width={layout.detailsPx}
        layout={bands}
        samples={samples}
      />
      <WaveRow frame={frame} width={layout.detailsPx} moving={moving} />
    </View>
  );
}

export function OralbStage({
  deviceId,
  view,
}: {
  readonly deviceId: string;
  readonly view: BrushStateView;
}): ReactNode {
  const frame = useFrame(deviceId, view.frame);
  const frameRef = useRef<View>(null);
  const { moving, onLayout } = useOnScreenGate(frameRef, true);
  const { width, onLayout: measure } = useMeasuredWidth();
  const layout = layoutOf(width);
  const kind = stageKindOf(view, frame);
  const columns = layout.columns;
  return (
    <View
      ref={frameRef}
      onLayout={(event) => {
        measure(event);
        onLayout?.();
      }}
      className="gap-4"
    >
      <SourceRow frame={frame} view={view} />
      {width === 0 ? null : (
        <View className={cn('gap-4', columns !== 'stacked' && 'flex-row items-start')}>
          <View className="flex-row items-center gap-4">
            <HandleBox deviceId={deviceId} view={view} px={layout.handlePx} />
            {kind === 'arch' ? (
              <Quarters frame={frame} view={view} layout={layout} moving={moving} />
            ) : (
              <Timed frame={frame} view={view} layout={layout} />
            )}
          </View>
          <Details frame={frame} view={view} layout={layout} moving={moving} deviceId={deviceId} />
        </View>
      )}
    </View>
  );
}
