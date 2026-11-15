import { Image } from 'expo-image';
import { useEffect, type ReactNode } from 'react';
import { View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useFrameCallback,
  useSharedValue,
} from 'react-native-reanimated';
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

export interface ClipCounter {
  get(): number;
  set(value: number): void;
}

export interface ClipPlayhead {
  readonly elapsed: ClipCounter;
  readonly cell: ClipCounter;
}

export function stepClip(
  playhead: ClipPlayhead,
  clip: ClipTiming,
  rate: number,
  deltaS: number,
): void {
  'worklet';
  const elapsedS = playhead.elapsed.get() + deltaS;
  playhead.elapsed.set(elapsedS);
  const index = clipFrame(clip, elapsedS, rate);
  if (index !== playhead.cell.get()) playhead.cell.set(index);
}

function useClipCell(clip: ClipTiming, playing: boolean, rate: number): ClipCounter {
  const held = heldFrame(clip);
  const elapsed = useSharedValue(0);
  const cell = useSharedValue(held);
  const frame = useFrameCallback((info) => {
    'worklet';
    stepClip({ elapsed, cell }, clip, rate, (info.timeSincePreviousFrame ?? 0) / 1000);
  }, false);
  useEffect(() => {
    if (!playing) cell.set(held);
    frame.setActive(playing);
    return (): void => {
      frame.setActive(false);
    };
  }, [playing, frame, cell, held]);
  return cell;
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
  playing,
  rate,
}: {
  readonly clip: ClipResult;
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
  const cell = useClipCell(timing, playing, rate);
  const sheet = useAnimatedStyle(() => {
    const offset = cellOffset(cells, cell.get());
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
