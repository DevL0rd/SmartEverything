import type { ReactNode } from 'react';
import { useState } from 'react';
import {
  StyleSheet,
  View,
  type AccessibilityActionEvent,
  type AccessibilityActionInfo,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSharedValue } from 'react-native-reanimated';
import { Image } from 'expo-image';
import { cn } from '../../../design/cn';
import type { FrameImage } from '../viewer/video-scrubber';
import { msAt, shareAt, type Trim, type TrimHandle } from './trim-model';

export const TRIM_HANDLE_PX = 24;

export const TRIM_BAR_HEIGHT = 56;

export const TRIM_STEP_MS = 100;

const ACTIONS: AccessibilityActionInfo[] = [{ name: 'increment' }, { name: 'decrement' }];

export type FrameSource = { readonly uri: string } | FrameImage;

export interface TrimBarProps {
  readonly trim: Trim;
  readonly playheadMs: number;
  readonly frames: readonly FrameSource[];
  readonly onWidth: (width: number) => void;
  readonly onMove: (handle: TrimHandle, ms: number) => void;
}

interface Span {
  readonly left: number;
  readonly width: number;
}

export function handleSpan(trim: Trim, handle: TrimHandle, width: number): Span {
  const ms = handle === 'start' ? trim.startMs : trim.endMs;
  const x = shareAt(ms, trim.durationMs) * width;
  return { left: handle === 'start' ? x - TRIM_HANDLE_PX : x, width: TRIM_HANDLE_PX };
}

export function trimSpans(
  trim: Trim,
  width: number,
): { readonly before: Span; readonly kept: Span; readonly after: Span } {
  const start = shareAt(trim.startMs, trim.durationMs) * width;
  const end = shareAt(trim.endMs, trim.durationMs) * width;
  return {
    before: { left: 0, width: start },
    kept: { left: start, width: Math.max(0, end - start) },
    after: { left: end, width: Math.max(0, width - end) },
  };
}

const BAR = { height: TRIM_BAR_HEIGHT } as const;

const GUTTER = { paddingHorizontal: TRIM_HANDLE_PX + 16 } as const;

function useHandleDrag(
  bar: TrimBarProps,
  width: number,
  handle: TrimHandle,
): ReturnType<typeof Gesture.Pan> {
  const start = useSharedValue(0);
  const { trim, onMove } = bar;
  return Gesture.Pan()
    .runOnJS(true)
    .minDistance(0)
    .onStart(() => {
      start.set(handle === 'start' ? trim.startMs : trim.endMs);
    })
    .onUpdate((event) => {
      onMove(handle, start.get() + msAt(event.translationX / Math.max(1, width), trim.durationMs));
    });
}

function stepOf(event: AccessibilityActionEvent): number {
  return event.nativeEvent.actionName === 'increment' ? TRIM_STEP_MS : -TRIM_STEP_MS;
}

function TrimHandleView({
  bar,
  width,
  handle,
}: {
  readonly bar: TrimBarProps;
  readonly width: number;
  readonly handle: TrimHandle;
}): ReactNode {
  const gesture = useHandleDrag(bar, width, handle);
  const { trim, onMove } = bar;
  const ms = handle === 'start' ? trim.startMs : trim.endMs;
  return (
    <GestureDetector gesture={gesture}>
      <View
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={handle === 'start' ? 'Trim start' : 'Trim end'}
        accessibilityActions={ACTIONS}
        onAccessibilityAction={(event) => {
          onMove(handle, ms + stepOf(event));
        }}
        className={cn(
          'absolute inset-y-0 items-center justify-center bg-primary',
          handle === 'start' ? 'rounded-l-md' : 'rounded-r-md',
        )}
        style={handleSpan(trim, handle, width)}
      >
        <View className="h-5 w-1 rounded-full bg-on-primary" />
      </View>
    </GestureDetector>
  );
}

function Frames({ frames }: { readonly frames: readonly FrameSource[] }): ReactNode {
  return (
    <View className="absolute inset-0 flex-row overflow-hidden rounded-sm bg-surface-2">
      {frames.map((frame, index) => (
        <View key={index} className="h-full flex-1">
          <Image source={frame} contentFit="cover" style={StyleSheet.absoluteFill} />
        </View>
      ))}
    </View>
  );
}

function playheadAt(ms: number, trim: Trim, width: number): { readonly left: number } {
  return { left: shareAt(ms, trim.durationMs) * width };
}

export function TrimBar(bar: TrimBarProps): ReactNode {
  const [width, setWidth] = useState(0);
  const spans = trimSpans(bar.trim, width);
  return (
    <View style={GUTTER}>
      <View
        style={BAR}
        onLayout={(event) => {
          setWidth(event.nativeEvent.layout.width);
          bar.onWidth(event.nativeEvent.layout.width);
        }}
      >
        <Frames frames={bar.frames} />
        <View className="absolute inset-y-0 bg-black/65" style={spans.before} />
        <View className="absolute inset-y-0 bg-black/65" style={spans.after} />
        <View
          pointerEvents="none"
          className="absolute inset-y-0 border-y-2 border-primary"
          style={spans.kept}
        />
        <View
          pointerEvents="none"
          className="absolute -inset-y-1 w-0.5 rounded-full bg-white"
          style={playheadAt(bar.playheadMs, bar.trim, width)}
        />
        <TrimHandleView bar={bar} width={width} handle="start" />
        <TrimHandleView bar={bar} width={width} handle="end" />
      </View>
    </View>
  );
}
