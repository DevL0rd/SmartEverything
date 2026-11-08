import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { Image, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import type { ImageOperationPreview, ImageOperationReceipt } from '@smarteverything/domain';
import { Text } from '../../../../components/text';
import { useLiveAnimationGate, useScreenLive } from '../../../../design/animation-gate';
import { SPIN, loopStyle } from '../../../../design/loops';
import { DURATION, EASING } from '../../../../design/motion';
import { ThemeScope } from '../../../../design/theme-scope';
import { useOnScreen } from '../../../../design/visibility';
import { playTime } from '../../../../format/time';
import { gridOf } from '../../components/image-grid';
import { useImagePreview } from '../data/image-queries';
import { imageReceiptStatus } from '../model/image-receipt';
import {
  elapsedSeconds,
  frameCells,
  generationStage,
  previewBlur,
} from '../model/image-generation';
import { previewUri } from './image-result-context';

export interface KeptPreview {
  readonly current: ImageOperationPreview;
  readonly previous: ImageOperationPreview | null;
  readonly seen: number;
}

export function useKeptPreview(operationId: string): KeptPreview | null {
  const preview = useImagePreview(operationId);
  const [kept, setKept] = useState<KeptPreview | null>(null);
  if (preview !== null && preview !== kept?.current) {
    setKept({ current: preview, previous: kept?.current ?? null, seen: (kept?.seen ?? 0) + 1 });
  }
  return kept;
}

const SECOND_MS = 1000;

function useLiveSeconds(since: string, running: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return undefined;
    const timer = setInterval(() => {
      setNow(Date.now());
    }, SECOND_MS);
    return (): void => {
      clearInterval(timer);
    };
  }, [running]);
  return elapsedSeconds(since, now);
}

function useLoop(progress: SharedValue<number>, moving: boolean, ms: number): void {
  useEffect(() => {
    progress.set(0);
    if (moving)
      progress.set(withRepeat(withTiming(1, { duration: ms, easing: Easing.linear }), -1));
    return (): void => {
      cancelAnimation(progress);
    };
  }, [moving, progress, ms]);
}

const SHEEN_MS = 2400;
const SHEEN_BAND = 0.7;

function Sheen({ moving }: { readonly moving: boolean }): ReactNode {
  const progress = useSharedValue(0);
  const width = useSharedValue(0);
  useLoop(progress, moving, SHEEN_MS);
  const band = useAnimatedStyle(() => ({
    width: width.get() * SHEEN_BAND,
    transform: [
      { translateX: width.get() * ((1 + SHEEN_BAND) * progress.get() - SHEEN_BAND) },
      { rotate: '20deg' },
    ],
  }));
  return (
    <View
      aria-hidden
      pointerEvents="none"
      className="absolute inset-0 overflow-hidden"
      onLayout={(event) => {
        width.set(event.nativeEvent.layout.width);
      }}
    >
      {moving ? (
        <Animated.View
          style={[band, { top: '-50%', bottom: '-50%' }]}
          className="absolute bg-linear-to-r from-transparent via-primary/12 to-transparent"
        />
      ) : null}
    </View>
  );
}

const TRAVEL_MS = 1600;
const SEGMENT = 0.3;

function Hairline({ moving }: { readonly moving: boolean }): ReactNode {
  const progress = useSharedValue(0);
  const width = useSharedValue(0);
  useLoop(progress, moving, TRAVEL_MS);
  const segment = useAnimatedStyle(() => ({
    width: width.get() * SEGMENT,
    transform: [{ translateX: width.get() * ((1 + SEGMENT) * progress.get() - SEGMENT) }],
  }));
  return (
    <View
      aria-hidden
      pointerEvents="none"
      className="absolute inset-x-0 bottom-0 h-0.5 overflow-hidden bg-primary/18"
      onLayout={(event) => {
        width.set(event.nativeEvent.layout.width);
      }}
    >
      {moving ? (
        <Animated.View style={segment} className="absolute inset-y-0 rounded-full bg-primary" />
      ) : null}
    </View>
  );
}

function PreviewLayer({
  preview,
  blur,
  fade,
}: {
  readonly preview: ImageOperationPreview;
  readonly blur: number;
  readonly fade: boolean;
}): ReactNode {
  const opacity = useSharedValue(fade ? 0 : 1);
  const style = useAnimatedStyle(() => ({ opacity: opacity.get() }));
  return (
    <Animated.View style={style} className="absolute inset-0">
      <Image
        source={{ uri: previewUri(preview) }}
        blurRadius={blur}
        resizeMode="cover"
        accessibilityLabel="Intermediate image preview, not saved"
        onLoad={() => {
          if (fade) opacity.set(withTiming(1, { duration: DURATION.medium, easing: EASING.fade }));
        }}
        className="size-full"
      />
    </Animated.View>
  );
}

function PreviewLayers({
  kept,
  reduced,
}: {
  readonly kept: KeptPreview;
  readonly reduced: boolean;
}): ReactNode {
  return (
    <>
      {kept.previous === null ? null : (
        <PreviewLayer
          key={kept.seen - 1}
          preview={kept.previous}
          blur={previewBlur(kept.seen - 1)}
          fade={false}
        />
      )}
      <PreviewLayer
        key={kept.seen}
        preview={kept.current}
        blur={previewBlur(kept.seen)}
        fade={!reduced}
      />
    </>
  );
}

function Spinner({ moving }: { readonly moving: boolean }): ReactNode {
  return (
    <Animated.View
      aria-hidden
      style={loopStyle({ name: SPIN, ms: 900 }, moving)}
      className="size-3 rounded-full border-2 border-on-surface/35 border-t-on-surface"
    />
  );
}

function Tag({ children }: { readonly children: ReactNode }): ReactNode {
  return (
    <View className="flex-row items-center gap-1 rounded-sm bg-black/45 px-1.5 py-0.5">
      {children}
    </View>
  );
}

function FrameTags({
  receipt,
  seconds,
  moving,
}: {
  readonly receipt: ImageOperationReceipt;
  readonly seconds: number;
  readonly moving: boolean;
}): ReactNode {
  const painting = generationStage(receipt) === 'painting';
  return (
    <ThemeScope theme="dark">
      <View
        pointerEvents="none"
        className="absolute inset-x-2 top-2 flex-row items-start justify-between"
      >
        <Tag>
          {painting ? <Spinner moving={moving} /> : null}
          <Text variant="caption">{painting ? 'Painting' : 'Queued'}</Text>
        </Tag>
        {painting ? (
          <Tag>
            <Text variant="caption" className="tabular-nums">
              {playTime(seconds)}
            </Text>
          </Tag>
        ) : null}
      </View>
    </ThemeScope>
  );
}

interface CellProps {
  readonly kept: KeptPreview | null;
  readonly queued: boolean;
  readonly moving: boolean;
  readonly reduced: boolean;
}

function GenerationCell({ kept, queued, moving, reduced }: CellProps): ReactNode {
  return (
    <View className="size-full overflow-hidden bg-surface-1">
      {kept === null ? <Sheen moving={moving} /> : <PreviewLayers kept={kept} reduced={reduced} />}
      {queued ? null : <Hairline moving={moving} />}
    </View>
  );
}

export function GenerationFrame({
  receipt,
  kept,
}: {
  readonly receipt: ImageOperationReceipt;
  readonly kept: KeptPreview | null;
}): ReactNode {
  const ref = useRef<View>(null);
  const live = useScreenLive();
  const { visible, onLayout } = useOnScreen(ref);
  const { moving, reduced } = useLiveAnimationGate(true, visible, live);
  const seconds = useLiveSeconds(receipt.created_at, visible && live.focused && live.foreground);
  const queued = generationStage(receipt) === 'queued';
  const grid = gridOf(frameCells(receipt));
  return (
    <View
      ref={ref}
      onLayout={onLayout}
      style={grid.shape}
      accessibilityRole="image"
      accessibilityLabel={imageReceiptStatus(receipt)}
      className="max-w-full gap-0.5 overflow-hidden rounded-md light:border light:border-outline-variant"
    >
      {grid.rows.map((row) => (
        <View
          key={row.cells.map((cell) => cell.index).join(':')}
          style={row.shape}
          className="w-full flex-row gap-0.5"
        >
          {row.cells.map((cell) => (
            <View key={cell.index} style={cell.shape} className="h-full">
              <GenerationCell
                kept={cell.index === 0 ? kept : null}
                queued={queued}
                moving={moving}
                reduced={reduced}
              />
            </View>
          ))}
        </View>
      ))}
      <FrameTags receipt={receipt} seconds={seconds} moving={moving} />
    </View>
  );
}
