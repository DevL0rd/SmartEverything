import { useEffect, useState, type ReactNode } from 'react';
import { AccessibilityInfo, findNodeHandle, useWindowDimensions, View } from 'react-native';
import Animated, {
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN, scheduleOnUI } from 'react-native-worklets';
import { DURATION, useMotion } from '../design/motion';
import { useValue } from '../design/external-store';
import { isNative } from '../design/platform';
import { useStableCallback } from '../design/use-stable-callback';
import { measureAnchor, type Rect } from './anchor';
import { scrollBoxIntoView } from './bring-into-view';
import { highlights, type AnchorEntry } from './highlight-anchors';
import { GLOW_SPREAD, frameOf, labelFrame, panesAround, ringAround } from './highlight-geometry';
import { Interactive } from './interactive';
import { Text } from './text';

const GLOW_REST = 0.35;
const GLOW_PEAK = 0.7;

function useKeyDismiss(): void {
  useEffect(() => {
    if (isNative()) {
      return undefined;
    }
    document.addEventListener('keydown', highlights.clear);
    return (): void => {
      document.removeEventListener('keydown', highlights.clear);
    };
  }, []);
}

function useAnnounce(entry: AnchorEntry): void {
  useEffect(() => {
    AccessibilityInfo.announceForAccessibility(`Highlighted: ${entry.label}`);
    if (!isNative()) {
      return;
    }
    const handle = findNodeHandle(entry.ref.current);
    if (handle !== null) {
      AccessibilityInfo.setAccessibilityFocus(handle);
    }
  }, [entry]);
}

function usePulses(): SharedValue<number> {
  const glow = useSharedValue(GLOW_REST);
  const { reduced } = useMotion();
  useEffect(() => {
    if (reduced) {
      return;
    }
    glow.set(
      withSequence(
        withTiming(GLOW_PEAK, { duration: DURATION.long }),
        withTiming(GLOW_REST, { duration: DURATION.long }),
        withTiming(GLOW_PEAK, { duration: DURATION.long }),
        withTiming(GLOW_REST, { duration: DURATION.long }),
      ),
    );
  }, [reduced, glow]);
  return glow;
}

function useTrackedBox(entry: AnchorEntry): Rect | null {
  const [box, setBox] = useState<Rect | null>(null);
  const idle = useSharedValue(0);
  const scrollY = entry.scroll?.scrollY ?? idle;
  const remeasure = useStableCallback(() => {
    measureAnchor(entry.ref, setBox);
  });
  useEffect(() => {
    measureAnchor(entry.ref, (measured) => {
      setBox(measured);
      if (entry.scroll !== null) {
        scheduleOnUI(
          scrollBoxIntoView,
          entry.scroll.scrollRef,
          entry.scroll.scrollY,
          { pageY: measured.y, height: measured.height },
          'if-hidden',
        );
      }
    });
  }, [entry]);
  useAnimatedReaction(
    () => scrollY.get(),
    (current, previous) => {
      if (previous !== null && current !== previous) {
        scheduleOnRN(remeasure);
      }
    },
    [scrollY, remeasure],
  );
  return box;
}

function Spotlight({ entry }: { readonly entry: AnchorEntry }): ReactNode {
  const box = useTrackedBox(entry);
  const glow = usePulses();
  const glowStyle = useAnimatedStyle(() => ({ opacity: glow.get() }));
  const viewport = useWindowDimensions();
  useKeyDismiss();
  useAnnounce(entry);
  if (box === null) {
    return null;
  }
  const ring = ringAround(box);
  return (
    <Interactive
      role="button"
      label="Dismiss highlight"
      focusable={false}
      onPressIn={highlights.clear}
      className="absolute inset-0"
    >
      {panesAround(ring, viewport).map(({ side, ...frame }) => (
        <View key={side} pointerEvents="none" className="absolute bg-scrim" style={frame} />
      ))}
      <Animated.View
        pointerEvents="none"
        className="absolute rounded-xl bg-primary/25"
        style={[frameOf(ring, GLOW_SPREAD), glowStyle]}
      />
      <View
        pointerEvents="none"
        className="absolute rounded-lg border-2 border-primary"
        style={frameOf(ring)}
      />
      <View
        pointerEvents="none"
        className="absolute rounded-full bg-primary px-3 py-1"
        style={labelFrame(ring, viewport)}
      >
        <Text variant="footnote" tone="onPrimary" numberOfLines={1}>
          {entry.label}
        </Text>
      </View>
    </Interactive>
  );
}

export function HighlightHost(): ReactNode {
  const shown = useValue(highlights.shown);
  return shown === null ? null : <Spotlight key={shown.key} entry={shown} />;
}
