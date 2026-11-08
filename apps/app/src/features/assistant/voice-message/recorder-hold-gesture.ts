import { Gesture, type PanGesture } from 'react-native-gesture-handler';
import {
  PLATFORM_LONG_PRESS_MS,
  holdGeometry,
  holdZoneOf,
  type HoldChannel,
} from './recorder-hold';

export interface HoldGestureInput {
  readonly enabled: boolean;
  readonly micOffset: number;
  readonly channel: HoldChannel;
  readonly onBegin: () => void;
  readonly onLost: () => void;
}

export function holdGesture(input: HoldGestureInput): PanGesture {
  const { enabled, micOffset, channel, onBegin, onLost } = input;
  const geometry = holdGeometry(micOffset);
  return Gesture.Pan()
    .enabled(enabled)
    .runOnJS(true)
    .activateAfterLongPress(PLATFORM_LONG_PRESS_MS)
    .onStart(() => {
      channel.begin();
      onBegin();
    })
    .onUpdate((event) => {
      channel.track(holdZoneOf(event.translationX, event.translationY, geometry));
    })
    .onEnd((_event, success) => {
      if (!channel.end(success)) onLost();
    });
}
