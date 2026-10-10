import type { ReactNode } from 'react';
import { View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { Icon, type IconName } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { entering, useMotion } from '../../../design/motion';
import { useAvailability } from '../../../store/selectors';
import { AssistantOrb } from '../call/orb';
import type { ChatState } from '../data/assistant-data';
import { sendMessage } from '../data/send';

interface Suggestion {
  readonly icon: IconName;
  readonly text: string;
}

function useSuggestions(): readonly Suggestion[] {
  const availability = useAvailability();
  return [
    availability.hasClimate
      ? { icon: 'airVent', text: 'What’s the air like at home?' }
      : { icon: 'home', text: 'What’s on at home right now?' },
    availability.hasHealth
      ? { icon: 'utensils', text: 'Log my dinner' }
      : { icon: 'automations', text: 'Make a bedtime routine' },
    { icon: 'bulb', text: 'Turn off the lights in 10 minutes' },
    availability.hasCameras
      ? { icon: 'cameras', text: 'Is anyone in the living room?' }
      : { icon: 'sparkles', text: 'What can you do for me?' },
  ];
}

function Hero({
  title,
  body,
  children,
}: {
  readonly title: string;
  readonly body: string;
  readonly children?: ReactNode;
}): ReactNode {
  const motion = useMotion();
  return (
    <Animated.View
      {...entering(motion, FadeInUp.duration(300))}
      className="w-full max-w-dialog items-center gap-4 self-center px-gutter"
    >
      <AssistantOrb state="idle" size={72} />
      <View className="items-center gap-1">
        <Text variant="title-2" align="center">
          {title}
        </Text>
        <Text variant="callout" tone="variant" align="center">
          {body}
        </Text>
      </View>
      {children}
    </Animated.View>
  );
}

export function EmptyChat({
  name,
  send = sendMessage,
}: {
  readonly name: string;
  readonly send?: (text: string, attachments: readonly string[]) => Promise<boolean>;
}): ReactNode {
  const suggestions = useSuggestions();
  return (
    <Hero
      title={`What can ${name} do for you?`}
      body="Ask about your home, your health or anything on your computer."
    >
      <View className="w-full flex-row flex-wrap justify-center gap-2 pt-2">
        {suggestions.map((suggestion) => (
          <Interactive
            key={suggestion.text}
            label={suggestion.text}
            onPress={() => {
              void send(suggestion.text, []);
            }}
            className="min-h-touch-min flex-row items-center gap-2 rounded-full border-hairline border-outline-variant bg-surface-2 px-4"
            layerClassName="rounded-full"
          >
            <Icon name={suggestion.icon} size={16} tone="primary" />
            <Text variant="callout">{suggestion.text}</Text>
          </Interactive>
        ))}
      </View>
    </Hero>
  );
}

export function BlockedChat({
  state,
}: {
  readonly state: Exclude<ChatState, { kind: 'ready' }>;
}): ReactNode {
  switch (state.kind) {
    case 'update-hub':
      return (
        <Hero
          title="Your server needs an update"
          body="Update SmartEverything on your computer to chat with your assistant."
        />
      );
    case 'offline':
      return (
        <Hero
          title="Can’t reach your server"
          body="The chat comes back as soon as your computer is reachable."
        />
      );
  }
}
