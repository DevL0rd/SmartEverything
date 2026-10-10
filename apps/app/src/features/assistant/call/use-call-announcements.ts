import { useEffect, useRef } from 'react';
import { AccessibilityInfo } from 'react-native';
import { router } from 'expo-router';
import { href } from '../../../app-shell/hrefs';
import { notify } from '../../../components/toast-store';
import { selectionTick } from '../../../platform/haptics';
import { callActive, changeCall, type CallView } from './call-state';
import { BUDGET_NOTICE } from './engine/call-messages';
import { lookedAtText, SHARING_STOPPED } from './model/call-copy';

function say(text: string): void {
  AccessibilityInfo.announceForAccessibility(text);
}

function cameraChange(before: CallView, after: CallView): readonly string[] {
  if (before.video.camera !== 'on' && after.video.camera === 'on') {
    return ['Camera on'];
  }
  return before.video.camera === 'on' && after.video.camera === 'off' ? ['Camera off'] : [];
}

function sightChange(before: CallView, after: CallView): readonly string[] {
  const stopped = before.sight !== null && after.sight === null && callActive(after);
  const reconnecting = before.phase !== 'reconnecting' && after.phase === 'reconnecting';
  return [...(stopped ? [SHARING_STOPPED] : []), ...(reconnecting ? ['Reconnecting'] : [])];
}

function lookChange(before: CallView, after: CallView): readonly string[] {
  const look = after.looks.at(-1);
  return look !== undefined && look.lookId !== before.looks.at(-1)?.lookId
    ? [lookedAtText(look.label)]
    : [];
}

function changes(before: CallView, after: CallView): readonly string[] {
  return [
    ...cameraChange(before, after),
    ...sightChange(before, after),
    ...lookChange(before, after),
  ];
}

export function useCallAnnouncements(call: CallView): void {
  const previous = useRef(call);
  useEffect(() => {
    for (const text of changes(previous.current, call)) {
      say(text);
    }
    if (lookChange(previous.current, call).length > 0 && !call.muted) {
      selectionTick();
    }
    previous.current = call;
  }, [call]);
}

export function useCallNotices(call: CallView): void {
  const { notice } = call;
  useEffect(() => {
    if (notice === null) {
      return;
    }
    notify({
      message: notice,
      tone: 'critical',
      ...(notice === BUDGET_NOTICE
        ? {
            action: {
              label: 'Budget',
              onPress: (): void => {
                router.push(href.settings.page('assistant/budget'));
              },
            },
          }
        : {}),
    });
    changeCall(() => ({ notice: null }));
  }, [notice]);
}
