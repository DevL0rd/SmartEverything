import type { SpeedTestResult } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Gauge } from '../../../components/charts';
import { Figure } from '../../../components/figure';
import { ProgressSteps, stepsAt, type ProgressStep } from '../../../components/progress-steps';
import { Text } from '../../../components/text';
import { milliseconds } from '../../../format/number';
import type { SpeedTestRun } from '../router-data';
import { rateParts } from './hero-model';
import { gaugeMax, type GaugePhase } from './speed-model';

const GAUGE_SIZE = 220;
const STEP_LABELS = ['Latency', 'Download', 'Upload'] as const;
const STEP_INDEX = { ping: 0, download: 1, upload: 2, done: 3, failed: 0 } as const;

interface Reading {
  readonly value: number;
  readonly max: number;
  readonly figure: string;
  readonly unit: string;
  readonly caption: string;
  readonly colour: 'viz-1' | 'viz-2';
}

function runningReading(
  phase: GaugePhase,
  run: SpeedTestRun,
  best: SpeedTestResult | null,
): Reading {
  if (phase === 'ping') {
    const ping = run.pingMs ?? 0;
    return {
      value: ping,
      max: gaugeMax(phase, best),
      figure: String(Math.round(ping)),
      unit: 'ms',
      caption: 'Latency',
      colour: 'viz-1',
    };
  }
  const rate = rateParts(run.mbps);
  return {
    value: run.mbps,
    max: gaugeMax(phase, best),
    figure: rate.value,
    unit: rate.unit,
    caption: phase === 'download' ? 'Download' : 'Upload',
    colour: phase === 'download' ? 'viz-1' : 'viz-2',
  };
}

function restingReading(last: SpeedTestResult | null, finished: boolean): Reading {
  const rate = rateParts(last?.downloadMbps ?? 0);
  return {
    value: last?.downloadMbps ?? 0,
    max: gaugeMax('download', last),
    figure: last === null ? '—' : rate.value,
    unit: rate.unit,
    caption: last === null ? 'No tests yet' : finished ? 'Download' : 'Last download',
    colour: 'viz-1',
  };
}

function readingOf(run: SpeedTestRun, last: SpeedTestResult | null): Reading {
  const phase = run.phase;
  if (run.running && phase !== null && phase !== 'done' && phase !== 'failed') {
    return runningReading(phase, run, last);
  }
  return restingReading(last, run.phase === 'done');
}

export function SpeedGauge({
  run,
  last,
}: {
  readonly run: SpeedTestRun;
  readonly last: SpeedTestResult | null;
}): ReactNode {
  const reading = readingOf(run, last);
  return (
    <View aria-hidden className="items-center">
      <Gauge
        value={reading.value}
        min={0}
        max={reading.max}
        bands={[{ upTo: reading.max, colour: reading.colour }]}
        size={GAUGE_SIZE}
        label={`${reading.caption} ${reading.figure} ${reading.unit}`}
      >
        <View className="items-center">
          <Figure value={reading.figure} unit={reading.unit} size="xl" />
          <Text variant="footnote" tone="variant">
            {reading.caption}
          </Text>
        </View>
      </Gauge>
    </View>
  );
}

function speedSteps(run: SpeedTestRun): readonly ProgressStep[] {
  const steps = stepsAt(STEP_LABELS, run.phase === null ? 0 : STEP_INDEX[run.phase]);
  return steps.map((step, index) =>
    index === 0 && run.pingMs !== null && run.phase !== 'ping'
      ? { ...step, detail: milliseconds(run.pingMs) }
      : step,
  );
}

export function SpeedSteps({ run }: { readonly run: SpeedTestRun }): ReactNode {
  return run.running || run.phase === 'done' ? <ProgressSteps steps={speedSteps(run)} /> : null;
}
