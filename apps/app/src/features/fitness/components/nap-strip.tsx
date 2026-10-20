import type { ReactNode } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedRef } from 'react-native-reanimated';
import { scheduleOnUI } from 'react-native-worklets';
import { bringIntoView } from '../../../components/bring-into-view';
import { useScreen } from '../../../components/screen-context';
import { STAGE_COLOURS, type HypnogramStage } from '../../../components/charts/hypnogram-model';
import { Text } from '../../../components/text';
import { useColour } from '../../../design/colour';
import { clock } from '../../../format/time';
import {
  napChipLabel,
  napLegendOf,
  napPiecesOf,
  napTitle,
  type NapPiece,
} from '../model/night-card';
import type { SleepNight } from '../model/sleep';
import { Interactive } from '../../../components/interactive';
import { Icon } from '../../../components/icon';

function Piece({ piece }: { readonly piece: NapPiece }): ReactNode {
  const fill = {
    flexGrow: piece.share,
    flexBasis: 0,
    backgroundColor: useColour(STAGE_COLOURS[piece.stage]),
  };
  return <View style={fill} className="h-5 min-w-1 rounded-xs" />;
}

function LegendEntry({
  stage,
  text,
}: {
  readonly stage: HypnogramStage;
  readonly text: string;
}): ReactNode {
  const fill = { backgroundColor: useColour(STAGE_COLOURS[stage]) };
  return (
    <View className="flex-row items-center gap-1.5">
      <View style={fill} className="size-2.5 rounded-xs" />
      <Text variant="footnote" tone="variant">
        {text}
      </Text>
    </View>
  );
}

export function NapStrip({ nap }: { readonly nap: SleepNight }): ReactNode {
  const legend = napLegendOf(nap);
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={`${napTitle(nap)}, ${clock(nap.bedtime)} to ${clock(nap.wake)}. ${legend.map((entry) => entry.text).join(', ')}`}
      className="gap-1.5"
    >
      <Text variant="body-strong">{napTitle(nap)}</Text>
      <View aria-hidden className="h-5 w-full flex-row gap-0.5">
        {napPiecesOf(nap).map((piece, index) => (
          <Piece key={`${piece.stage}-${String(index)}`} piece={piece} />
        ))}
      </View>
      <View aria-hidden className="flex-row justify-between">
        <Text variant="caption">{clock(nap.bedtime)}</Text>
        <Text variant="caption">{clock(nap.wake)}</Text>
      </View>
      {legend.length === 0 ? null : (
        <View aria-hidden className="flex-row flex-wrap gap-x-4 gap-y-1">
          {legend.map((entry) => (
            <LegendEntry key={entry.stage} stage={entry.stage} text={entry.text} />
          ))}
        </View>
      )}
    </View>
  );
}

export function NapChip({
  nap,
  onPress,
}: {
  readonly nap: SleepNight;
  readonly onPress: () => void;
}): ReactNode {
  return (
    <Interactive
      onPress={onPress}
      label={`${napChipLabel(nap)}. Show the nap`}
      className="min-h-touch-min flex-row items-center gap-2 self-start rounded-full bg-surface-2 px-4"
      layerClassName="rounded-full"
    >
      <Icon name="moon" size={16} />
      <Text variant="label" className="tabular">
        {napChipLabel(nap)}
      </Text>
    </Interactive>
  );
}

export function useNapReveal(): {
  readonly ref: ReturnType<typeof useAnimatedRef<Animated.View>>;
  readonly reveal: () => void;
} {
  const ref = useAnimatedRef<Animated.View>();
  const { scrollRef, scrollY } = useScreen();
  return {
    ref,
    reveal: (): void => {
      if (scrollRef !== null) {
        scheduleOnUI(bringIntoView, ref, scrollRef, scrollY);
      }
    },
  };
}

export function NapSection({
  naps,
  target,
}: {
  readonly naps: readonly SleepNight[];
  readonly target: ReturnType<typeof useNapReveal>['ref'];
}): ReactNode {
  return (
    <Animated.View ref={target} collapsable={false} className="gap-4">
      {naps.map((nap) => (
        <NapStrip key={nap.recordId} nap={nap} />
      ))}
    </Animated.View>
  );
}
