import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, View, useWindowDimensions } from 'react-native';
import Animated, {
  interpolate,
  useAnimatedReaction,
  useAnimatedStyle,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';
import {
  CHROME_SURFACE,
  FLOATING_SHEET_SURFACE,
  floatingSheetFrame,
} from '../components/compact-panel';
import { FloatingSheetViewport } from '../components/floating-sheet-viewport';
import { HostedSheetPages, useHostedNativeBack } from '../components/hosted-sheet-pages';
import { useSheetNavigation } from '../components/sheet-navigation';
import { KeyboardViewport } from '../components/keyboard-viewport';
import { useEscape } from '../components/use-escape';
import { cn } from '../design/cn';
import { useValue } from '../design/external-store';
import { useMotion } from '../design/motion';
import { registerSheetSearch } from '../search/open-search';
import { NavSheetBody } from './nav-sheet-body';
import {
  closeNavSheet,
  navSheetLift,
  navSheetPhase,
  navSheetQuery,
  navSheetReduced,
  navSheetStops,
  searchInNavSheet,
  settleNavSheet,
  type NavSheetStops,
} from './nav-sheet-state';

const HALF_SHARE = 0.55;

function useSheetStops(height: number, full: number): NavSheetStops {
  const { reduced } = useMotion();
  const stops = {
    half: Math.min(Math.round(height * HALF_SHARE), full),
    full,
  };
  useEffect(() => {
    navSheetStops.set({ half: stops.half, full: stops.full });
    navSheetReduced.set(reduced);
    settleNavSheet(navSheetPhase.get(), 0);
  }, [stops.half, stops.full, reduced]);
  return useMemo(() => ({ half: stops.half, full: stops.full }), [stops.half, stops.full]);
}

function useSheetLifecycle(back: () => void): void {
  const open = useValue(navSheetPhase) !== 'closed';
  useEscape(open, back);
  useHostedNativeBack(open, back);
  useEffect(() => registerSheetSearch(searchInNavSheet), []);
  useEffect(
    () => (): void => {
      navSheetPhase.set('closed');
      navSheetLift.set(0);
    },
    [],
  );
}

function useShown(): boolean {
  const [shown, setShown] = useState(false);
  useAnimatedReaction(
    () => navSheetLift.get() > 0.5,
    (now, before) => {
      if (now !== before) {
        scheduleOnRN(setShown, now);
      }
    },
  );
  useEffect(() => {
    if (!shown) {
      navSheetQuery.set('');
    }
  }, [shown]);
  return shown;
}

function Panel({
  stops,
  frame,
  navigation,
}: {
  readonly stops: NavSheetStops;
  readonly frame: ReturnType<typeof floatingSheetFrame>;
  readonly navigation: ReturnType<typeof useSheetNavigation>;
}): ReactNode {
  const scrim = useAnimatedStyle(() => ({
    opacity: interpolate(navSheetLift.get(), [0, stops.half], [0, 1], 'clamp'),
  }));
  const slide = useAnimatedStyle(() => ({
    transform: [{ translateY: stops.full - navSheetLift.get() }],
  }));
  const size = { height: stops.full };
  const active = navigation.pages.at(-1);
  const body = useMemo(() => <NavSheetBody stops={stops} />, [stops]);
  return (
    <View pointerEvents="box-none" className="absolute inset-0">
      <Animated.View style={scrim} className="absolute inset-0 bg-scrim">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            active === undefined ? 'Close navigation' : `Back from ${active.page.title}`
          }
          onPress={navigation.back}
          className="flex-1"
        />
      </Animated.View>
      <FloatingSheetViewport frame={frame}>
        <Animated.View
          accessibilityViewIsModal
          aria-modal
          accessibilityLabel={active?.page.title ?? 'Navigation'}
          style={[size, slide]}
          className={cn('absolute inset-x-0 bottom-0', CHROME_SURFACE, FLOATING_SHEET_SURFACE)}
        >
          <KeyboardViewport className="flex-1">
            <HostedSheetPages navigation={navigation} label="Navigation">
              {body}
            </HostedSheetPages>
          </KeyboardViewport>
        </Animated.View>
      </FloatingSheetViewport>
    </View>
  );
}

export function NavSheetHost(): ReactNode {
  const window = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const frame = floatingSheetFrame(window, insets);
  const stops = useSheetStops(window.height, frame.maxHeight);
  const navigation = useSheetNavigation(closeNavSheet);
  useSheetLifecycle(navigation.back);
  const shown = useShown();
  return shown ? <Panel stops={stops} frame={frame} navigation={navigation} /> : null;
}
