import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSharedValue } from 'react-native-reanimated';
import type { PhotoBox } from '@smarteverything/domain';
import { cn } from '../../../design/cn';
import { HANDLES, WHOLE, dragged, minimumOf, type Handle } from './crop-model';
import type { Rect } from './geometry';

export const HANDLE_PX = 48;

export interface CropOverlayProps {
  readonly rect: Rect;
  readonly box: PhotoBox | null;
  readonly share: number | null;
  readonly onDraft: (box: PhotoBox) => void;
  readonly onCommit: (box: PhotoBox) => void;
}

function handleAt(handle: Exclude<Handle, 'move'>, box: Rect): Rect {
  const x = handle.includes('w') ? 0 : handle.includes('e') ? box.width : box.width / 2;
  const y = handle.includes('n') ? 0 : handle.includes('s') ? box.height : box.height / 2;
  return {
    left: box.left + x - HANDLE_PX / 2,
    top: box.top + y - HANDLE_PX / 2,
    width: HANDLE_PX,
    height: HANDLE_PX,
  };
}

export function shadesOf(box: Rect, rect: Rect): readonly Rect[] {
  const right = box.left + box.width;
  const bottom = box.top + box.height;
  return [
    { left: 0, top: 0, width: rect.width, height: box.top },
    { left: 0, top: bottom, width: rect.width, height: rect.height - bottom },
    { left: 0, top: box.top, width: box.left, height: box.height },
    { left: right, top: box.top, width: rect.width - right, height: box.height },
  ];
}

function pixelsOf(box: PhotoBox, rect: Rect): Rect {
  return {
    left: box.x * rect.width,
    top: box.y * rect.height,
    width: box.w * rect.width,
    height: box.h * rect.height,
  };
}

function useDrag(props: CropOverlayProps, handle: Handle): ReturnType<typeof Gesture.Pan> {
  const start = useSharedValue<PhotoBox>(WHOLE);
  const latest = useSharedValue<PhotoBox>(WHOLE);
  const box = props.box ?? WHOLE;
  const { rect, share } = props;
  return Gesture.Pan()
    .runOnJS(true)
    .minDistance(0)
    .onStart(() => {
      start.set(box);
      latest.set(box);
    })
    .onUpdate((event) => {
      const next = dragged({
        start: start.get(),
        handle,
        dx: event.translationX / Math.max(1, rect.width),
        dy: event.translationY / Math.max(1, rect.height),
        min: minimumOf(HANDLE_PX, rect),
        share,
      });
      latest.set(next);
      props.onDraft(next);
    })
    .onEnd(() => {
      props.onCommit(latest.get());
    });
}

function HandleMark({ handle }: { readonly handle: Exclude<Handle, 'move'> }): ReactNode {
  const corner = handle.length === 2;
  return (
    <View
      className={cn(
        'rounded-full bg-white',
        corner ? 'size-4' : handle === 'n' || handle === 's' ? 'h-1.5 w-6' : 'h-6 w-1.5',
      )}
    />
  );
}

function CropHandle({
  props,
  handle,
  box,
}: {
  readonly props: CropOverlayProps;
  readonly handle: Exclude<Handle, 'move'>;
  readonly box: Rect;
}): ReactNode {
  const gesture = useDrag(props, handle);
  const at = handleAt(handle, box);
  return (
    <GestureDetector gesture={gesture}>
      <View
        accessible
        accessibilityLabel={`Crop edge ${handle}`}
        className="absolute items-center justify-center"
        style={at}
      >
        <HandleMark handle={handle} />
      </View>
    </GestureDetector>
  );
}

function Shade({ box, rect }: { readonly box: Rect; readonly rect: Rect }): ReactNode {
  return (
    <>
      {shadesOf(box, rect).map((shade, index) => (
        <View key={index} className="absolute bg-black/60" style={shade} />
      ))}
    </>
  );
}

function Thirds({ box }: { readonly box: Rect }): ReactNode {
  return (
    <View pointerEvents="none" className="absolute border border-white" style={box}>
      <View className="absolute inset-y-0 left-1/3 w-px bg-white/40" />
      <View className="absolute inset-y-0 left-2/3 w-px bg-white/40" />
      <View className="absolute inset-x-0 top-1/3 h-px bg-white/40" />
      <View className="absolute inset-x-0 top-2/3 h-px bg-white/40" />
    </View>
  );
}

export function CropOverlay(props: CropOverlayProps): ReactNode {
  const box = pixelsOf(props.box ?? WHOLE, props.rect);
  const move = useDrag(props, 'move');
  return (
    <View className="absolute inset-0">
      <Shade box={box} rect={props.rect} />
      <GestureDetector gesture={move}>
        <View accessible accessibilityLabel="Move the crop" className="absolute" style={box} />
      </GestureDetector>
      <Thirds box={box} />
      {HANDLES.map((handle) => (
        <CropHandle key={handle} props={props} handle={handle} box={box} />
      ))}
    </View>
  );
}
