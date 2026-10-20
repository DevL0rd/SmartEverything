import type { BrushStateView } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Card } from '../../components/card';
import { LoadedQuery } from '../../components/loaded-query';
import { Text } from '../../components/text';
import { useMeasuredWidth } from '../../components/use-measured-width';
import { cn } from '../../design/cn';
import { useMinute } from '../../store/clock';
import type { Device } from '../../store/state';
import { brandUi } from './brands';
import { BrushVisual } from './components/brush-visual';
import { HeroChips } from './components/hero-chips';
import { LiveStage } from './components/live-stage';
import { useBrushDemand, useBrushState, useFrameSelect } from './data/brush-data';
import { isBrushing } from './model/live-frame';
import { linkLine } from './model/brush-model';
import { restBesideBrush } from './model/rest-layout';

function Resting({
  device,
  view,
}: {
  readonly device: Device;
  readonly view: BrushStateView;
}): ReactNode {
  const { width, onLayout } = useMeasuredWidth();
  const wide = restBesideBrush(width);
  const now = useMinute();
  const { HandleStrip, RestHero } = brandUi(view.profile.brand);
  if (RestHero !== null && view.mine && view.lastSession !== null) {
    return <RestHero deviceId={device.id} view={view} session={view.lastSession} />;
  }
  return (
    <View
      onLayout={onLayout}
      className={cn('items-center gap-4', wide && 'flex-row justify-center gap-8')}
    >
      <BrushVisual device={device} view={view} />
      <View className={cn('min-w-0 gap-3', wide ? 'flex-1' : 'self-stretch')}>
        <HeroChips deviceId={device.id} view={view} linkShown />
        <Text variant="footnote" tone="variant">
          {linkLine(view, now)}
        </Text>
        {HandleStrip === null ? null : <HandleStrip deviceId={device.id} view={view} />}
      </View>
    </View>
  );
}

function Private({ view }: { readonly view: BrushStateView }): ReactNode {
  return (
    <View className="gap-1">
      <Text variant="title-3">Brushing now</Text>
      <Text variant="callout" tone="variant">
        {view.personName === null
          ? 'Sessions on this brush are private.'
          : `Sessions on this brush belong to ${view.personName}.`}
      </Text>
    </View>
  );
}

function Active({
  device,
  view,
}: {
  readonly device: Device;
  readonly view: BrushStateView;
}): ReactNode {
  const visible = useFrameSelect(device.id, view.frame, (frame) => frame.detailVisible);
  const { HeroStage } = brandUi(view.profile.brand);
  const Stage = HeroStage ?? LiveStage;
  const shown = view.mine || visible;
  return (
    <View className="gap-4">
      <HeroChips deviceId={device.id} view={view} linkShown={HeroStage !== null && shown} />
      {shown ? <Stage deviceId={device.id} view={view} /> : <Private view={view} />}
    </View>
  );
}

function HeroCard({
  device,
  view,
}: {
  readonly device: Device;
  readonly view: BrushStateView;
}): ReactNode {
  const brushing = useFrameSelect(device.id, view.frame, isBrushing);
  return (
    <Card>
      {brushing ? <Active device={device} view={view} /> : <Resting device={device} view={view} />}
    </Card>
  );
}

export function BrushHero({ device }: { readonly device: Device }): ReactNode {
  const state = useBrushState(device.id);
  useBrushDemand(device.id);
  return (
    <LoadedQuery query={state}>{(view) => <HeroCard device={device} view={view} />}</LoadedQuery>
  );
}
