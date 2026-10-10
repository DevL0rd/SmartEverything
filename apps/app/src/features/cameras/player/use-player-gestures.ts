import { Directions, Gesture, type ComposedGesture } from 'react-native-gesture-handler';
import { useSharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useIdiom } from '../../../design/platform';
import type { PtzDirection } from './use-ptz';
import type { CameraZoom } from './use-camera-zoom';
import { ZOOM_MAX, ZOOM_MIN, clamp, placeWithin, type Zoom } from './use-zoom';

const PTZ_THRESHOLD = 24;
const PTZ_HOLD_MS = 250;

function ptzDirectionOf(dx: number, dy: number): PtzDirection | null {
  'worklet';
  if (Math.max(Math.abs(dx), Math.abs(dy)) < PTZ_THRESHOLD) {
    return null;
  }
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx < 0 ? 'right' : 'left';
  }
  return dy < 0 ? 'down' : 'up';
}

export interface GestureHandlers {
  readonly zoom: Zoom;
  readonly camera: CameraZoom;
  readonly onTap: () => void;
  readonly ptz: ((direction: PtzDirection | null) => void) | null;
  readonly onSwipe: ((step: 1 | -1) => void) | null;
}

function useZoomGestures(zoom: Zoom): ComposedGesture {
  const startZoom = useSharedValue(1);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const { shared, report } = zoom;
  const tell = (): void => {
    'worklet';
    scheduleOnRN(report, { zoom: shared.zoom.get(), x: shared.x.get(), y: shared.y.get() });
  };
  const pinch = Gesture.Pinch()
    .onBegin(() => {
      startZoom.set(shared.zoom.get());
    })
    .onUpdate((event) => {
      shared.zoom.set(clamp(startZoom.get() * event.scale, ZOOM_MIN, ZOOM_MAX));
      placeWithin(shared, shared.x.get(), shared.y.get());
    })
    .onEnd(tell);
  const pan = Gesture.Pan()
    .enabled(zoom.view.zoom > 1)
    .onBegin(() => {
      startX.set(shared.x.get());
      startY.set(shared.y.get());
    })
    .onUpdate((event) => {
      placeWithin(shared, startX.get() + event.translationX, startY.get() + event.translationY);
    })
    .onEnd(tell);
  return Gesture.Simultaneous(pinch, pan);
}

function useCameraPinch(camera: CameraZoom): ComposedGesture {
  const start = useSharedValue(1);
  const pinch = Gesture.Pinch()
    .onBegin(() => {
      start.set(camera.level);
    })
    .onUpdate((event) => {
      scheduleOnRN(camera.preview, start.get() * event.scale);
    })
    .onEnd((event) => {
      scheduleOnRN(camera.commit, start.get() * event.scale);
    });
  return Gesture.Simultaneous(pinch);
}

function usePtzGesture(
  ptz: ((direction: PtzDirection | null) => void) | null,
  zoomed: boolean,
): ComposedGesture {
  const touch = useIdiom() === 'touch';
  const current = useSharedValue<PtzDirection | null>(null);
  const release = (): void => {
    'worklet';
    current.set(null);
    if (ptz !== null) {
      scheduleOnRN(ptz, null);
    }
  };
  const drag = Gesture.Pan()
    .enabled(ptz !== null && !zoomed)
    .activateAfterLongPress(touch ? PTZ_HOLD_MS : 0)
    .onUpdate((event) => {
      const direction = ptzDirectionOf(event.translationX, event.translationY);
      if (direction !== current.get() && ptz !== null) {
        current.set(direction);
        scheduleOnRN(ptz, direction);
      }
    })
    .onFinalize(release);
  return Gesture.Simultaneous(drag);
}

function useSwipe(onSwipe: ((step: 1 | -1) => void) | null, zoomed: boolean): ComposedGesture {
  const fling = (direction: Directions, step: 1 | -1): ReturnType<typeof Gesture.Fling> =>
    Gesture.Fling()
      .direction(direction)
      .enabled(onSwipe !== null && !zoomed)
      .runOnJS(true)
      .onEnd(() => {
        onSwipe?.(step);
      });
  return Gesture.Race(fling(Directions.LEFT, 1), fling(Directions.RIGHT, -1));
}

export function usePlayerGestures({
  zoom,
  camera,
  onTap,
  ptz,
  onSwipe,
}: GestureHandlers): ComposedGesture {
  const zoomed = zoom.view.zoom > 1;
  const taps = Gesture.Exclusive(
    Gesture.Tap()
      .numberOfTaps(2)
      .runOnJS(true)
      .onEnd(camera.supported ? camera.toggle : zoom.toggle),
    Gesture.Tap().runOnJS(true).onEnd(onTap),
  );
  const digital = useZoomGestures(zoom);
  const optical = useCameraPinch(camera);
  return Gesture.Race(
    camera.supported ? optical : digital,
    usePtzGesture(ptz, zoomed),
    useSwipe(onSwipe, zoomed),
    taps,
  );
}
