import { Image } from 'expo-image';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import type { ClipResult } from '../bake/bake-protocol';

export type ClipTiming = Pick<ClipResult, 'introFrames' | 'loopFrames' | 'stillFrame' | 'frameS'>;

export type ClipCells = Pick<ClipResult, 'columns' | 'rect'>;

export interface CellOffset {
  readonly x: number;
  readonly y: number;
}

export function clipFrame(clip: ClipTiming, elapsedS: number, rate: number): number {
  'worklet';
  const introS = clip.introFrames * clip.frameS;
  if (elapsedS < introS) return Math.max(0, Math.floor(elapsedS / clip.frameS));
  const looped = Math.floor(((elapsedS - introS) * Math.abs(rate)) / clip.frameS);
  const step = ((looped % clip.loopFrames) + clip.loopFrames) % clip.loopFrames;
  return clip.introFrames + (rate < 0 ? (clip.loopFrames - step) % clip.loopFrames : step);
}

export function heldFrame(clip: ClipTiming): number {
  'worklet';
  return clip.introFrames + (clip.stillFrame % clip.loopFrames);
}

export function cellOffset(clip: ClipCells, index: number): CellOffset {
  'worklet';
  const column = index % clip.columns;
  const row = Math.floor(index / clip.columns);
  return { x: -column * clip.rect.width, y: -row * clip.rect.height };
}

export interface BoxStyle {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export function rectStyle(rect: ClipResult['rect']): BoxStyle {
  return { left: rect.x, top: rect.y, width: rect.width, height: rect.height };
}

function sheetSize(clip: ClipResult): Pick<BoxStyle, 'width' | 'height'> {
  return { width: clip.rect.width * clip.columns, height: clip.rect.height * clip.rows };
}

export function ClipAtlas({
  clip,
  clock,
  playing,
  rate,
}: {
  readonly clip: ClipResult;
  readonly clock: SharedValue<number>;
  readonly playing: boolean;
  readonly rate: number;
}): ReactNode {
  const { rect } = clip;
  const timing: ClipTiming = {
    introFrames: clip.introFrames,
    loopFrames: clip.loopFrames,
    stillFrame: clip.stillFrame,
    frameS: clip.frameS,
  };
  const cells: ClipCells = { columns: clip.columns, rect };
  const sheet = useAnimatedStyle(() => {
    const index = playing ? clipFrame(timing, clock.get(), rate) : heldFrame(timing);
    const offset = cellOffset(cells, index);
    return { transform: [{ translateX: offset.x }, { translateY: offset.y }] };
  });
  return (
    <View pointerEvents="none" className="absolute overflow-hidden" style={rectStyle(rect)}>
      <Animated.View style={[sheetSize(clip), sheet]}>
        <Image
          source={clip.uri}
          recyclingKey={clip.uri}
          cachePolicy="disk"
          contentFit="fill"
          transition={0}
          style={sheetSize(clip)}
          accessible={false}
        />
      </Animated.View>
    </View>
  );
}
