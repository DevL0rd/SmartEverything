import type { BrushLiveFrame, BrushStateView } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Icon } from '../../../components/icon';
import { Text } from '../../../components/text';
import { ForceGauge } from '../charts/force-gauge';
import { PressureTrace, TRACE_HEIGHT } from '../charts/pressure-trace';
import { StateMeter } from '../charts/state-meter';
import {
  FORCE_MAX,
  gaugeLabel,
  meterKindOf,
  meterLabel,
  pressureBandOf,
  shareOf,
  type BandLayout,
  type PressureBand,
} from '../model/gauge-model';
import { ORALB_PRESSURE, PRESSURE_OF_BAND } from '../model/pressure-look';
import { gaugePx } from '../model/stage-model';
import {
  pathOf,
  sharePath,
  stripShares,
  tracePoints,
  traceLabel,
  type TraceSample,
} from '../model/trace-model';
import { BAND_NAME } from '../model/gauge-model';
import { TRACE_LABEL_WIDTH } from '../charts/pressure-trace';

function Word({ band }: { readonly band: PressureBand | null }): ReactNode {
  if (band === null) {
    return (
      <Text variant="title-3" tone="faint">
        No reading
      </Text>
    );
  }
  const look = ORALB_PRESSURE[PRESSURE_OF_BAND[band]];
  return (
    <View className="flex-row items-center gap-2">
      <Icon
        name={look.icon}
        size={24}
        tone={band === 'hard' ? 'critical' : band === 'good' ? 'positive' : 'variant'}
      />
      <Text variant="title-2" tone={band === 'hard' ? 'critical' : 'default'}>
        {BAND_NAME[band]}
      </Text>
    </View>
  );
}

export function traceOf(
  samples: readonly TraceSample[],
  frame: BrushLiveFrame,
  width: number,
  force: boolean,
): { readonly path: string; readonly label: string } {
  const size = { width: Math.max(0, width - TRACE_LABEL_WIDTH), height: TRACE_HEIGHT };
  if (force) {
    return {
      path: pathOf(tracePoints(samples, FORCE_MAX, size)),
      label: traceLabel('force', null),
    };
  }
  return { path: sharePath(stripShares(frame.strip), size), label: traceLabel('state', null) };
}

export function PressureRow({
  frame,
  view,
  width,
  layout,
  samples,
}: {
  readonly frame: BrushLiveFrame;
  readonly view: BrushStateView;
  readonly width: number;
  readonly layout: BandLayout;
  readonly samples: readonly TraceSample[];
}): ReactNode {
  const kind = meterKindOf(view.profile, frame);
  const band = pressureBandOf(frame, layout);
  const trace = traceOf(samples, frame, width, kind === 'gauge');
  return (
    <View className="gap-3">
      <View className="flex-row items-center gap-4">
        <View className="shrink-0">
          {kind === 'gauge' ? (
            <ForceGauge
              width={gaugePx(width)}
              layout={layout}
              share={shareOf(frame.force ?? 0)}
              band={band}
              label={gaugeLabel(band, layout.learned)}
            />
          ) : null}
        </View>
        {kind === 'gauge' ? null : (
          <View className="min-w-0 flex-1">
            <StateMeter kind={kind} band={band} label={meterLabel(kind, band)} />
          </View>
        )}
        <View className="min-w-0 flex-1">
          <Word band={band} />
        </View>
      </View>
      <PressureTrace
        width={width}
        layout={layout}
        path={trace.path}
        label={`${trace.label}${band === null ? '' : `, now ${BAND_NAME[band].toLowerCase()}`}`}
      />
    </View>
  );
}
