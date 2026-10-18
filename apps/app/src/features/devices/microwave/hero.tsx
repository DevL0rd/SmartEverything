import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Badge } from '../../../components/badge';
import { Card } from '../../../components/card';
import { ProgressBar } from '../../../components/charts';
import { FigureText } from '../../../components/figure';
import { ReasonLine } from '../../../components/reason-line';
import { Text } from '../../../components/text';
import type { Device } from '../../../store/state';
import { DeviceVisual } from '../../device-visuals';
import { blockedReason, cardChip, factsLine, stateLine } from './card-model';
import { OperatingButtons } from './operating-buttons';
import { leftText, type MicrowaveRun } from './run-model';
import { useCycles } from './use-cycles';
import { useRun } from './use-run';

function Countdown({ run }: { readonly run: MicrowaveRun }): ReactNode {
  const left = leftText(run);
  return left === null ? null : (
    <View className="items-center gap-0.5" accessible accessibilityLabel={`${left} left`}>
      <FigureText
        text={left}
        unit={undefined}
        size="xl"
        tone={run.phase === 'paused' ? 'faint' : 'default'}
        stale={run.phase === 'offline'}
      />
      {run.readyAt === null ? null : (
        <Text variant="footnote" tone="variant">
          {`ready ${run.readyAt}`}
        </Text>
      )}
    </View>
  );
}

function Controls({
  device,
  run,
}: {
  readonly device: Device;
  readonly run: MicrowaveRun;
}): ReactNode {
  const reason = blockedReason(run);
  if (run.phase === 'running' || run.phase === 'paused') {
    return <OperatingButtons device={device} />;
  }
  return reason === null ? null : (
    <ReasonLine icon={run.phase === 'door_open' ? 'doorOpen' : 'info'} text={reason} />
  );
}

export function MicrowaveHero({ device }: { readonly device: Device }): ReactNode {
  const run = useRun(device);
  const last = useCycles(device.id, true)[0];
  const chip = cardChip(run);
  const facts = factsLine(run);
  return (
    <Card>
      <View className="items-center gap-4 py-2">
        <DeviceVisual device={device} size="hero" />
        <View className="items-center gap-1.5">
          <View accessibilityLiveRegion="polite">
            <Badge label={chip.label} tone={chip.tone} />
          </View>
          <Countdown run={run} />
          <Text variant="footnote" tone="variant" align="center" numberOfLines={2}>
            {stateLine(run, last)}
          </Text>
        </View>
        {run.progress === null ? null : (
          <View className="w-full">
            <ProgressBar
              progress={run.progress}
              colour="temp-warm"
              label={`Progress ${String(Math.round(run.progress * 100))} percent`}
              thick
            />
          </View>
        )}
        <Controls device={device} run={run} />
        {facts === null ? null : (
          <Text variant="footnote" tone="faint" align="center">
            {facts}
          </Text>
        )}
      </View>
    </Card>
  );
}
