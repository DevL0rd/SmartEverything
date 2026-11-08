import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Card } from '../../../components/card';
import { Text } from '../../../components/text';
import { millilitres } from '../../../format/number';
import { href } from '../../../app-shell/hrefs';
import { WIDE_VISUAL_PX, WideArt } from '../../../features/devices';
import type { Device } from '../../../store/state';
import { useBottleStatus } from '../data/bottle-data';
import { levelLine } from '../model/bottle-model';
import { BottleFigure } from './bottle-figure';
import { StateChip } from './state-chip';

export function BottleStrip({ device }: { readonly device: Device }): ReactNode {
  const view = useBottleStatus(device.id).data;
  if (view === undefined) {
    return null;
  }
  return (
    <Card href={href.deviceSection(device.id, 'overview')} label={`${device.label}: back to today`}>
      <View className="flex-row gap-3">
        <WideArt cls="m">
          <BottleFigure device={device} view={view} size="card" px={WIDE_VISUAL_PX.m} />
        </WideArt>
        <View className="min-w-0 flex-1 gap-1">
          <View className="flex-row items-center justify-between gap-2">
            <Text variant="body-strong" numberOfLines={2} className="min-w-0 flex-1">
              {levelLine(view)}
            </Text>
            <StateChip view={view} />
          </View>
          <Text variant="footnote" tone="variant">
            {`Today ${millilitres(Math.round(view.today.totalMl))} of ${millilitres(Math.round(view.today.goalMl))}`}
          </Text>
        </View>
      </View>
    </Card>
  );
}
