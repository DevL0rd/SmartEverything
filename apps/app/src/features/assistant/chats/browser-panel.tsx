import { useIsFocused } from 'expo-router';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { PANEL_SLIDE } from './list-pane';
import { DURATION, EASING, useMotion } from '../../../design/motion';
import { BROWSER_MIN_WIDTH, type PanelState } from './chat-panel-state';
import { View } from 'react-native';
import type { AiChatRow } from '@smarteverything/domain';
import { IconButton } from '../../../components/icon-button';
import { cn } from '../../../design/cn';
import { Text } from '../../../components/text';
import type { useBrowserTabs } from '../browser/browser-tab-events';
import { HarnessBrowser } from '../provider/harness-browser';

function BrowserPanel({
  chat,
  onClose,
  docked,
  visible,
  browser,
}: {
  readonly browser: ReturnType<typeof useBrowserTabs>;
  readonly visible: boolean;
  readonly docked: boolean;
  readonly chat: AiChatRow;
  readonly onClose: () => void;
}): ReactNode {
  const focused = useIsFocused();
  return (
    <View
      accessibilityLabel="Browser"
      style={docked ? { width: BROWSER_MIN_WIDTH } : undefined}
      className={cn(
        'min-h-0 h-full bg-surface-1',
        docked ? 'border-l border-outline-variant' : 'min-w-0 flex-1',
      )}
    >
      <View className="min-h-touch-min flex-row items-center gap-2 pl-6 pr-2">
        {docked ? null : <IconButton icon="arrowLeft" label="Back to chat" onPress={onClose} />}
        <Text variant="title-3" accessibilityRole="header" className="flex-1">
          Browser
        </Text>
        <IconButton icon="close" label="Close browser" onPress={onClose} shortcut="Ctrl I" />
      </View>
      <HarnessBrowser chat={chat} visible={visible ? focused : false} {...browser} />
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
  const opened = panel.open ? active : false;
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
      aria-hidden={!panel.open}
      accessibilityElementsHidden={!panel.open}
      importantForAccessibility={panel.open ? 'auto' : 'no-hide-descendants'}
      style={panel.open && panel.docked ? { width: BROWSER_MIN_WIDTH } : undefined}
      className={cn('min-h-0 overflow-hidden', browserPaneClass(panel))}
    >
      <Animated.View
        style={fade}
        pointerEvents={panel.open ? 'auto' : 'none'}
        className="min-h-0 flex-1"
      >
        {mounted ? (
          <BrowserPanel
            chat={chat}
            browser={browser}
            onClose={panel.hide}
            docked={panel.docked}
            visible={opened}
          />
        ) : null}
      </Animated.View>
    </Animated.View>
  );
}

function browserPaneClass(panel: PanelState): string {
  if (!panel.open) return 'w-0';
  return panel.docked ? 'shrink-0' : 'min-w-0 flex-1';
}

function useOpenedBrowser(opened: boolean): boolean {
  const [mounted, setMounted] = useState(opened);
  if (opened && !mounted) setMounted(true);
  return mounted;
}
