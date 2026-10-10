import type { ReactNode } from 'react';
import { View } from 'react-native';
import { router, usePathname } from 'expo-router';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { href } from '../../../app-shell/hrefs';
import { useAssistantName } from '../data/assistant-data';
import { callActive, orbStateOf, useCall } from './call-state';
import { useElapsed } from './components/use-elapsed';
import { AssistantOrb } from './orb';

const CALL_PATH = '/assistant/call';
const PILL_ORB = 28;

export function CallPill(): ReactNode {
  const call = useCall();
  const name = useAssistantName();
  const active = callActive(call);
  const elapsed = useElapsed(call.startedAt, active);
  const onCallScreen = usePathname() === CALL_PATH;
  if (!active || onCallScreen) {
    return null;
  }
  return (
    <Interactive
      onPress={() => {
        router.push(href.assistantCall('chat'));
      }}
      label={`Back to the call with ${name}`}
      className="flex-row items-center gap-2 rounded-full bg-primary-container py-1 pl-1 pr-4"
      layerClassName="rounded-full"
    >
      <AssistantOrb state={orbStateOf(call)} size={PILL_ORB} />
      <View>
        <Text variant="label" tone="primary">
          {name}
        </Text>
        <Text variant="caption" tone="variant">
          {elapsed}
        </Text>
      </View>
    </Interactive>
  );
}
