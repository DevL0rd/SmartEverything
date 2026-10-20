import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Card } from '../../../components/card';
import { Text } from '../../../components/text';
import { millilitres } from '../../../format/number';
import { href } from '../../../app-shell/hrefs';
import type { Device } from '../../../store/state';
import { useBottleStatus } from '../data/bottle-data';
import { levelLine } from '../model/bottle-model';
import { BottleFigure } from './bottle-figure';
import { StateChip } from './state-chip';

const STRIP_PX = 72;

export function BottleStrip({ device }: { readonly device: Device }): ReactNode {
  const view = useBottleStatus(device.id).data;
  if (view === undefined) {
    return null;
  }
  return (
    <Card href={href.deviceSection(device.id, 'overview')} label={`${device.label}: back to today`}>
      <View className="min-h-24 flex-row items-center gap-4">
        <BottleFigure device={device} view={view} size="card" px={STRIP_PX} />
        <View className="min-w-0 flex-1 gap-1">
          <Text variant="body-strong" numberOfLines={1}>
            {levelLine(view)}
          </Text>
          <Text variant="footnote" tone="variant">
            {`Today ${millilitres(Math.round(view.today.totalMl))} of ${millilitres(Math.round(view.today.goalMl))}`}
          </Text>
        </View>
        <StateChip view={view} />
      </View>
    </Card>
  );
}
