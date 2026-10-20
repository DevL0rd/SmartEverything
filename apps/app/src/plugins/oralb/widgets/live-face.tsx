import type { BrushLiveFrame, BrushStateView, BrushingSession } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Rings } from '../../../components/charts';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { useMeasuredWidth } from '../../../components/use-measured-width';
import { useWidgetFace } from '../../../components/widget-board/use-widget-face';
import { relative } from '../../../format/time';
import { useMinute } from '../../../store/clock';
import type { WidgetFaceProps } from '../../toothbrush/brand-ui';
import { ModeChip } from '../../toothbrush/components/mode-chip';
import { PressureBadge } from '../../toothbrush/components/pressure-badge';
import { TimerRing } from '../../toothbrush/components/timer-ring';
import { PressureStrip } from '../../toothbrush/charts/pressure-strip';
import { clockText } from '../../toothbrush/model/brush-model';
import { recapOf } from '../../toothbrush/model/session-model';
import { bodyHeightOf, liveKind, ringPxOf } from '../../toothbrush/model/widget-model';
import { QuadrantArch } from '../charts/quadrant-arch';
import { PressureTrace, TRACE_LABEL_WIDTH } from '../charts/pressure-trace';
import { ResultFace } from '../charts/result-face';
import { sizeStyle } from '../charts/style';
import { traceOf } from '../components/pressure-row';
import { useOralbSettings } from '../data/use-oralb';
import { useForceTrace } from '../data/use-trace';
import { archLabel, centreLines } from '../model/arch-model';
import { bandsOf, meterKindOf } from '../model/gauge-model';
import { recapViewOf, routineWord } from '../model/recap-model';
import { liveQuarters } from '../model/stage-model';
import { stepCaptionOf, widgetLayoutOf, type WidgetLayout } from '../model/widget-model';
import { QuarterBar } from './quarter-bar';
import { WidgetHandle } from './widget-handle';

const ARCH_FRACTION = 1.5;
const COLUMN_ROW_PX = 120;

function Trace({
  frame,
  view,
  deviceId,
}: {
  readonly frame: BrushLiveFrame;
  readonly view: BrushStateView;
  readonly deviceId: string;
}): ReactNode {
  const { width, onLayout } = useMeasuredWidth();
  const layout = bandsOf(useOralbSettings(deviceId).forceBands);
  const samples = useForceTrace(frame);
  const trace = traceOf(samples, frame, width, meterKindOf(view.profile, frame) === 'gauge');
  return (
    <View onLayout={onLayout} className="min-w-0 flex-1">
      {width <= TRACE_LABEL_WIDTH ? null : (
        <PressureTrace width={width} layout={layout} path={trace.path} label={trace.label} />
      )}
    </View>
  );
}

function BrushingInfo({
  view,
  frame,
  inline,
}: {
  readonly view: BrushStateView;
  readonly frame: BrushLiveFrame;
  readonly inline: boolean;
}): ReactNode {
  return (
    <View className="min-w-0 flex-1 gap-2">
      <ModeChip brand="oralb" mode={frame.mode} />
      <View className={cn('gap-2', inline && 'flex-row flex-wrap items-center')}>
        <Text variant="footnote" tone="variant" numberOfLines={1}>
          {stepCaptionOf(view, frame)}
        </Text>
        {frame.pressure === null ? null : <PressureBadge brand="oralb" pressure={frame.pressure} />}
      </View>
    </View>
  );
}

function Brushing({
  device,
  view,
  frame,
  layout,
  body,
}: WidgetFaceProps & { readonly layout: WidgetLayout; readonly body: number }): ReactNode {
  const quarters = liveQuarters(view, frame);
  const lines = centreLines({
    elapsedS: frame.elapsedS,
    routineS: frame.routineS,
    current: frame.zone,
    finished: false,
    quarters,
  });
  const archPx = Math.round(Math.min(300, (body - 8) * ARCH_FRACTION));
  const report = layout === 'report';
  const row = layout === 'row';
  return (
    <View className="flex-1 gap-3">
      <View className="flex-1 flex-row items-center gap-4">
        <WidgetHandle device={device} view={view} body={body} />
        {report ? (
          <QuadrantArch
            quarters={quarters}
            big={lines.big}
            small={lines.small}
            width={archPx}
            moving
            label={archLabel(quarters, false)}
          />
        ) : (
          <TimerRing frame={frame} size={ringPxOf(body)} />
        )}
        <View className="min-w-0 flex-1 gap-3">
          <BrushingInfo view={view} frame={frame} inline={row} />
          {row ? <QuarterBar quarters={quarters} /> : null}
        </View>
        {row || report ? <Trace frame={frame} view={view} deviceId={device.id} /> : null}
      </View>
      {layout === 'column' ? (
        <>
          <QuarterBar quarters={quarters} />
          <Trace frame={frame} view={view} deviceId={device.id} />
        </>
      ) : null}
    </View>
  );
}

function RestRing({
  durationS,
  routineS,
  word,
  size,
}: {
  readonly durationS: number;
  readonly routineS: number;
  readonly word: string;
  readonly size: number;
}): ReactNode {
  return (
    <View
      accessible
      accessibilityLabel={`Last brushing ${clockText(durationS)} of ${clockText(routineS)}, ${word}`}
      className="items-center justify-center"
      style={sizeStyle(size, size)}
    >
      <Rings
        size={size}
        rings={[
          {
            progress: Math.min(1, durationS / routineS),
            colour: 'primary',
            label: clockText(durationS),
          },
        ]}
      />
      <View className="absolute items-center">
        <Text variant={size >= 112 ? 'title-1' : 'title-3'} className="tabular">
          {clockText(durationS)}
        </Text>
      </View>
    </View>
  );
}

function Resting({
  device,
  view,
  session,
  layout,
  body,
}: Omit<WidgetFaceProps, 'frame'> & {
  readonly session: BrushingSession;
  readonly layout: WidgetLayout;
  readonly body: number;
}): ReactNode {
  const now = useMinute();
  const recap = recapViewOf(session);
  const runs = recapOf(session, view.profile).runs;
  const word = routineWord(session);
  const wide = layout !== 'compact';
  return (
    <View className="flex-1 gap-3">
      <View className="flex-1 flex-row items-center gap-4">
        <WidgetHandle device={device} view={view} body={body} />
        <RestRing
          durationS={session.durationS}
          routineS={session.routineS}
          word={word}
          size={ringPxOf(body)}
        />
        <View className="min-w-0 flex-1 gap-2">
          <ModeChip brand="oralb" mode={session.mode} />
          {recap.face === null ? null : (
            <View className="flex-row items-center gap-2">
              <ResultFace face={recap.face} size={24} />
              <Text variant="footnote" numberOfLines={1} className="min-w-0 flex-1">
                Face {String(recap.face.level)} of 11
              </Text>
            </View>
          )}
          <Text variant="footnote" tone="variant" numberOfLines={2}>
            {word} · {relative(session.startedAt, now)}
          </Text>
        </View>
      </View>
      {wide && recap.quarters !== null ? <QuarterBar quarters={recap.quarters} /> : null}
      {wide && runs.length > 0 ? (
        <PressureStrip brand="oralb" runs={runs} seconds={session.durationS} />
      ) : null}
    </View>
  );
}

export function OralbLiveFace({ device, view, frame }: WidgetFaceProps): ReactNode {
  const { frame: box, cls } = useWidgetFace();
  const body = bodyHeightOf(box);
  const layout = widgetLayoutOf(cls);
  const rowBody = layout === 'column' ? COLUMN_ROW_PX : body;
  const kind = liveKind(view, frame);
  if (kind === 'brushing') {
    return <Brushing device={device} view={view} frame={frame} layout={layout} body={rowBody} />;
  }
  const { lastSession } = view;
  return lastSession === null ? null : (
    <Resting device={device} view={view} session={lastSession} layout={layout} body={rowBody} />
  );
}
