import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { Badge } from '../../../components/badge';
import { Banner } from '../../../components/banner';
import { Button } from '../../../components/button';
import { Card } from '../../../components/card';
import { Gauge } from '../../../components/charts';
import { Figure } from '../../../components/figure';
import { Text } from '../../../components/text';
import { href } from '../../../app-shell/hrefs';
import { decimal } from '../../../format/number';
import type { Device } from '../../../store/state';
import { DeviceVisual } from '../../device-visuals';
import { useDayReadings } from '../model/health-readings';
import { AssignSheet } from '../scale/assign-sheet';
import { targetsFor } from '../scale/assign-model';
import { readingsLabel, scaleActions, scaleLine, type ScaleAction } from '../scale/card-model';
import { BANNER_BODY, SCORE_BANDS, deltaChips, scoreWord } from '../scale/hero-model';
import { PersonChip } from '../scale/person-chip';
import { useScale, useScaleStage, type Scale } from '../scale/use-scale';
import { useDay } from './health-hero';

function FromHealthConnect(): ReactNode {
  const weights = useDayReadings('weight');
  const day = useDay();
  const last = weights.at(-1);
  if (last === undefined) {
    return (
      <Text variant="callout" tone="variant" align="center">
        Step on the scale with your phone nearby.
      </Text>
    );
  }
  return (
    <View className="items-center gap-1">
      <Figure value={decimal(last.value, 1)} unit={last.unit} size="xl" stale />
      <Text variant="footnote" tone="variant">
        {`From Health Connect · ${day(last)}`}
      </Text>
    </View>
  );
}

function Score({ score }: { readonly score: number }): ReactNode {
  return (
    <View className="flex-row items-center gap-3">
      <Gauge
        value={score}
        min={0}
        max={100}
        bands={SCORE_BANDS}
        size={84}
        label={`Body score ${decimal(score, 0)}`}
      >
        <Text variant="title-3" className="tabular">
          {decimal(score, 0)}
        </Text>
      </Gauge>
      <View>
        <Text variant="caption" tone="variant">
          Body score
        </Text>
        <Text variant="callout">{scoreWord(score)}</Text>
      </View>
    </View>
  );
}

function WeighInFigure({ scale }: { readonly scale: Scale }): ReactNode {
  const { latest, weekDelta, monthDelta, latestCounted } = scale.facts;
  if (latest === null) {
    return <FromHealthConnect />;
  }
  const line = scaleLine(scale.facts, scale.when);
  const score = latestCounted?.composition?.body_score;
  return (
    <View className="items-center gap-2">
      <Figure
        value={decimal(latest.kg, 1)}
        unit="kg"
        size="xl"
        tone={latest.outlier ? 'warning' : 'default'}
        stale={scale.facts.stale}
      />
      <Text variant="footnote" tone={line.tone} align="center">
        {line.text}
      </Text>
      <View className="flex-row flex-wrap items-center justify-center gap-2">
        {deltaChips(weekDelta, monthDelta).map((chip) => (
          <Badge key={chip} label={chip} />
        ))}
      </View>
      {score === undefined ? null : <Score score={score} />}
    </View>
  );
}

function HeroActions({
  scale,
  onOpen,
}: {
  readonly scale: Scale;
  readonly onOpen: (kind: ScaleAction['kind']) => void;
}): ReactNode {
  return (
    <View className="flex-row flex-wrap items-center justify-center gap-2">
      <PersonChip deviceId={scale.device.id} people={scale.people} person={scale.person} />
      {scaleActions(scale.facts, 0).map((action) => (
        <Button
          key={action.kind}
          label={action.label}
          variant={action.filled ? 'filled' : 'text'}
          icon="user"
          onPress={() => {
            onOpen(action.kind);
          }}
        />
      ))}
      <Button
        label="Open in Fitness"
        icon="fitness"
        variant="tonal"
        href={href.fitnessPage('body')}
      />
    </View>
  );
}

function PendingBanner({
  count,
  onAssign,
}: {
  readonly count: number;
  readonly onAssign: () => void;
}): ReactNode {
  return count === 0 ? null : (
    <Banner
      tone="warning"
      title={readingsLabel(count)}
      body={BANNER_BODY}
      wrapBody
      action={{ label: 'Assign', onPress: onAssign }}
    />
  );
}

export function ScaleHero({ device }: { readonly device: Device }): ReactNode {
  const scale = useScale(device);
  const stage = useScaleStage(device, scale.facts);
  const [open, setOpen] = useState<ScaleAction['kind'] | null>(null);
  const { pending, person, facts } = scale;
  return (
    <View className="gap-section-gap">
      <PendingBanner
        count={pending.length}
        onAssign={() => {
          setOpen('queue');
        }}
      />
      <Card>
        <View className="items-center gap-4 py-2">
          <DeviceVisual device={device} size="hero" state={stage} />
          <WeighInFigure scale={scale} />
          <HeroActions scale={scale} onOpen={setOpen} />
        </View>
      </Card>
      {open === null ? null : (
        <AssignSheet
          queue={targetsFor(open, facts.latest, person?.profile.id ?? null, pending)}
          onClose={() => {
            setOpen(null);
          }}
        />
      )}
    </View>
  );
}
