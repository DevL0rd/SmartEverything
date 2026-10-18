import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { AccessibilityInfo, View } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useMotion } from '../design/motion';
import { isNative, useIdiom } from '../design/platform';
import { friendlyError, rawErrorText } from '../format/errors';
import { Icon } from './icon';
import { IconButton } from './icon-button';
import { Interactive } from './interactive';
import { Text } from './text';
import { useFocusHold, useToastMotion } from './toast-gesture';
import { actOnToast, dismissToast, expandToast, UNDO_MS, type Toast } from './toast-store';

const DISMISS_ACTIONS = [{ name: 'dismiss', label: 'Dismiss' }];

function ToastButton({
  label,
  onPress,
}: {
  readonly label: string;
  readonly onPress: () => void;
}): ReactNode {
  return (
    <Interactive
      label={label}
      onPress={onPress}
      className="min-h-touch-min justify-center rounded-sm px-3"
      layerClassName="rounded-sm"
    >
      <Text variant="label" tone="primary">
        {label}
      </Text>
    </Interactive>
  );
}

function ToneIcon({ toast }: { readonly toast: Toast }): ReactNode {
  if (toast.tone === 'critical') {
    return <Icon name="alert" tone="critical" />;
  }
  return toast.tone === 'positive' ? <Icon name="circleCheck" tone="positive" /> : null;
}

function Count({ count }: { readonly count: number }): ReactNode {
  if (count < 2) {
    return null;
  }
  return (
    <Text
      variant="caption"
      tone="variant"
      accessibilityLabel={`${String(count)} times`}
      className="tabular rounded-full bg-surface-1 px-2"
    >
      {`×${String(count)}`}
    </Text>
  );
}

function Body({
  toast,
  expanded,
}: {
  readonly toast: Toast;
  readonly expanded: boolean;
}): ReactNode {
  const friendly = toast.detail ?? (toast.error === undefined ? null : friendlyError(toast.error));
  return (
    <View className="min-w-0 flex-1 gap-0.5 py-2">
      <View className="flex-row items-center gap-2">
        <Text variant="callout" className="shrink">
          {toast.message}
        </Text>
        <Count count={toast.count} />
      </View>
      {friendly === null ? null : (
        <Text variant="footnote" tone="variant" numberOfLines={expanded ? undefined : 2}>
          {friendly}
        </Text>
      )}
      {expanded && toast.error !== undefined ? (
        <Text variant="footnote" tone="variant" selectable>
          {rawErrorText(toast.error)}
        </Text>
      ) : null}
    </View>
  );
}

function useAnnounce(toast: Toast): void {
  const lead = toast.detail === undefined ? toast.message : `${toast.message}. ${toast.detail}`;
  const text = toast.undoable ? `${lead}. Undo available.` : lead;
  useEffect(() => {
    if (isNative()) {
      AccessibilityInfo.announceForAccessibility(text);
    }
  }, [text, toast.count]);
}

function Actions({ toast }: { readonly toast: Toast }): ReactNode {
  const [expanded, setExpanded] = useState(false);
  const pointer = useIdiom() === 'pointer';
  return (
    <>
      <Body toast={toast} expanded={expanded} />
      {toast.error !== undefined && !expanded ? (
        <ToastButton
          label="Details"
          onPress={() => {
            setExpanded(true);
            expandToast(toast);
          }}
        />
      ) : null}
      {toast.action === undefined ? null : (
        <ToastButton
          label={toast.action.label}
          onPress={() => {
            actOnToast(toast);
          }}
        />
      )}
      {pointer ? (
        <IconButton
          icon="close"
          label="Dismiss"
          onPress={() => {
            dismissToast(toast.id);
          }}
        />
      ) : null}
    </>
  );
}

function UndoBar({ held }: { readonly held: boolean }): ReactNode {
  const { reduced } = useMotion();
  const remaining = useSharedValue(1);
  useEffect(() => {
    if (reduced) {
      return;
    }
    if (held) {
      cancelAnimation(remaining);
      return;
    }
    remaining.set(withTiming(0, { duration: remaining.get() * UNDO_MS, easing: Easing.linear }));
  }, [held, reduced, remaining]);
  const style = useAnimatedStyle(() => ({
    transform: [{ scaleX: remaining.get() }],
    transformOrigin: 'left center',
  }));
  if (reduced) {
    return null;
  }
  return (
    <Animated.View
      pointerEvents="none"
      style={style}
      className="absolute bottom-0.5 left-3.5 right-3.5 h-0.5 rounded-full bg-primary"
    />
  );
}

function liveRegion(critical: boolean): 'none' | 'polite' | 'assertive' {
  if (isNative()) {
    return 'none';
  }
  return critical ? 'assertive' : 'polite';
}

export function ToastCard({ toast }: { readonly toast: Toast }): ReactNode {
  const idiom = useIdiom();
  const motion = useToastMotion(toast.id, toast.leaving, idiom);
  const critical = toast.tone === 'critical';
  const content = useFocusHold(toast.id);
  useAnnounce(toast);
  return (
    <GestureDetector gesture={motion.gesture}>
      <Animated.View
        style={motion.style}
        onLayout={(event) => {
          motion.onWidth(event.nativeEvent.layout.width);
        }}
        pointerEvents={toast.leaving ? 'none' : 'auto'}
        accessibilityRole={critical ? 'alert' : 'summary'}
        accessibilityLiveRegion={liveRegion(critical)}
        accessibilityHint={idiom === 'touch' ? 'Swipe sideways to dismiss' : undefined}
        accessibilityActions={DISMISS_ACTIONS}
        onAccessibilityAction={() => {
          dismissToast(toast.id);
        }}
        className="w-full max-w-dialog rounded-md border-hairline border-outline bg-surface-3 elevation-3"
      >
        <View ref={content} className="flex-row items-center gap-3 py-1 pl-4 pr-1">
          <ToneIcon toast={toast} />
          <Actions toast={toast} />
        </View>
        {toast.undoable ? <UndoBar held={toast.held} /> : null}
      </Animated.View>
    </GestureDetector>
  );
}
