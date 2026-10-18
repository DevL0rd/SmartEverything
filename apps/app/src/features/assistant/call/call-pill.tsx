import type { ReactNode } from 'react';
import { View } from 'react-native';
import { router, usePathname } from 'expo-router';
import { Icon } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { href } from '../../../app-shell/hrefs';
import { useAssistantName } from '../data/assistant-data';
import { stopSharing } from './call-actions';
import { callActive, orbStateOf, useCall } from './call-state';
import { SightIndicator } from './components/sight-indicator';
import { useElapsed } from './components/use-elapsed';
import { statusOf } from './model/call-copy';
import { useDesktopOverlayOn } from '../overlay/overlay-surface';
import { AssistantOrb } from './orb';
import { useCallAudio } from './settings-sheet/call-audio-pref';

const CALL_PATH = '/assistant/call';
const PILL_ORB = 28;

export function CallPill(): ReactNode {
  const call = useCall();
  const name = useAssistantName();
  const { pref } = useCallAudio();
  const active = callActive(call);
  const elapsed = useElapsed(call.startedAt, active);
  const onCallScreen = usePathname() === CALL_PATH;
  const overlayOn = useDesktopOverlayOn();
  if (!active || onCallScreen || overlayOn) {
    return null;
  }
  return (
    <View className="max-w-full flex-row items-center rounded-full bg-primary-container pr-1">
      <Interactive
        onPress={() => {
          router.push(href.assistantCall('chat'));
        }}
        label={`Back to the call with ${name}`}
        className="min-h-touch-min min-w-0 shrink flex-row items-center gap-2 rounded-full py-1 pl-1 pr-3"
        layerClassName="rounded-full"
      >
        <AssistantOrb
          state={orbStateOf(call)}
          size={PILL_ORB}
          dimmed={call.phase === 'reconnecting'}
        />
        <View className="min-w-0 shrink">
          <Text variant="label" tone="primary" numberOfLines={1}>
            {`Call · ${elapsed}`}
          </Text>
          <Text variant="caption" tone="variant" numberOfLines={1}>
            {statusOf(call, name)}
          </Text>
        </View>
        <Icon name="chevronRight" size={16} tone="variant" />
      </Interactive>
      {call.sight === null ? null : (
        <SightIndicator sight={call.sight} mode={pref.video_mode} onStop={stopSharing} />
      )}
    </View>
  );
}
