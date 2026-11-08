import { useIsFocused } from 'expo-router';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { PANEL_SLIDE } from './list-pane';
import { DURATION, EASING, useMotion } from '../../../design/motion';
import type { PanelState } from './chat-panel-state';
import { View } from 'react-native';
import type { AiChatRow } from '@smarteverything/domain';
import { cn } from '../../../design/cn';
import { browserInert } from '../../../platform/browser-focus';
import type { useBrowserTabs } from '../browser/browser-tab-events';
import { HarnessBrowser } from '../provider/harness-browser';

function BrowserPanel({
  chat,
  docked,
  visible,
  browser,
}: {
  readonly browser: ReturnType<typeof useBrowserTabs>;
  readonly visible: boolean;
  readonly docked: boolean;
  readonly chat: AiChatRow;
}): ReactNode {
  return (
    <View
      role="region"
      accessibilityLabel="Browser"
      className={cn('min-h-0 h-full bg-surface-1', docked && 'border-l border-outline-variant')}
    >
      <HarnessBrowser chat={chat} visible={visible} {...browser} />
    </View>
  );
}

export function BrowserPane({
  chat,
  panel,
  browser,
  active,
}: {
  readonly active: boolean;
  readonly chat: AiChatRow;
  readonly panel: PanelState;
  readonly browser: ReturnType<typeof useBrowserTabs>;
}): ReactNode {
  const { reduced } = useMotion();
  const focused = useIsFocused();
  const opened = panel.open && active;
  const shown = opened && focused;
  const mounted = useOpenedBrowser(opened);
  const visible = useSharedValue(panel.open ? 1 : 0);
  useEffect(() => {
    const target = panel.open ? 1 : 0;
    visible.set(
      reduced ? target : withTiming(target, { duration: DURATION.medium, easing: EASING.standard }),
    );
  }, [panel.open, reduced, visible]);
  const fade = useAnimatedStyle(() => ({ opacity: visible.get() }));
  return (
    <Animated.View
      {...(reduced ? {} : { layout: PANEL_SLIDE })}
      {...browserInert(!shown)}
      aria-hidden={!shown}
      accessibilityElementsHidden={!shown}
      importantForAccessibility={shown ? 'auto' : 'no-hide-descendants'}
      className={cn('min-h-0 min-w-0 overflow-hidden', panel.open ? 'flex-1' : 'w-0')}
    >
      <Animated.View
        style={fade}
        pointerEvents={shown ? 'auto' : 'none'}
        className="min-h-0 flex-1"
      >
        {mounted ? (
          <BrowserPanel chat={chat} browser={browser} docked={panel.docked} visible={shown} />
        ) : null}
      </Animated.View>
    </Animated.View>
  );
}

function useOpenedBrowser(opened: boolean): boolean {
  const [mounted, setMounted] = useState(opened);
  if (opened && !mounted) setMounted(true);
  return mounted;
}
