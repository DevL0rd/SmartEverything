import type { ReactNode } from 'react';
import { View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import type { AiChatRow } from '@smarteverything/domain';
import { href } from '../../../app-shell/hrefs';
import { Button } from '../../../components/button';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { entering, useMotion } from '../../../design/motion';
import { useAvailability } from '../../../store/selectors';
import { AssistantOrb } from '../call/orb';
import { useChatWorking } from '../data/chat-store';
import { setDraft } from '../data/drafts';
import type { BlockedAreaStatus } from '../model/area-status';
import {
  EMPTY_GREETING,
  helperIntroOf,
  introSuggestionsOf,
  type HelperIntro,
} from '../model/chat-intro';
import { assistantParticipant, helperParticipant } from '../model/participant';
import { INK_TEXT } from './chat-surface';
import { SpeakerAvatar } from './speaker-avatar';
import { Spinner } from './work-step-list';

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
      <View className="max-w-dialog items-center gap-1">
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

function IntroChip({
  chatId,
  text,
}: {
  readonly chatId: string;
  readonly text: string;
}): ReactNode {
  return (
    <Interactive
      label={text}
      hint="Fills the message field without sending"
      onPress={() => {
        setDraft(chatId, text);
      }}
      className="h-7.5 max-w-full justify-center rounded-full border border-outline px-3"
      layerClassName="rounded-full"
    >
      <Text variant="footnote" numberOfLines={1}>
        {text}
      </Text>
    </Interactive>
  );
}

function MainEmpty({
  chatId,
  name,
  live,
}: {
  readonly chatId: string;
  readonly name: string;
  readonly live: boolean;
}): ReactNode {
  const motion = useMotion();
  const suggestions = introSuggestionsOf(useAvailability());
  return (
    <Animated.View
      {...entering(motion, FadeInUp.duration(300))}
      className="w-full max-w-dialog-wide flex-1 justify-end self-center px-gutter"
    >
      <View className="mb-7 items-center gap-2.5">
        <SpeakerAvatar participant={assistantParticipant(name)} live={live} size={40} />
        <Text variant="body" align="center">
          {EMPTY_GREETING}
        </Text>
      </View>
      <View className="flex-row flex-wrap justify-center gap-1.5">
        {suggestions.map((text) => (
          <IntroChip key={text} chatId={chatId} text={text} />
        ))}
      </View>
    </Animated.View>
  );
}

function HelperEmpty({
  chatId,
  helper,
  live,
}: {
  readonly chatId: string;
  readonly helper: HelperIntro;
  readonly live: boolean;
}): ReactNode {
  const motion = useMotion();
  const participant = helperParticipant({ helper_chat_id: chatId, helper_name: helper.name });
  return (
    <Animated.View
      {...entering(motion, FadeInUp.duration(300))}
      className="w-full flex-1 items-center justify-center gap-2 px-gutter"
    >
      <SpeakerAvatar participant={participant} live={live} size={40} />
      <Text variant="label" align="center" className={INK_TEXT[participant.ink]}>
        {helper.name}
      </Text>
      {helper.goal === null ? null : (
        <Text variant="footnote" tone="faint" align="center" className="max-w-70">
          {helper.goal}
        </Text>
      )}
    </Animated.View>
  );
}

export function EmptyChat({
  chat,
  name,
}: {
  readonly chat: AiChatRow;
  readonly name: string;
}): ReactNode {
  const live = useChatWorking(chat.id);
  const helper = helperIntroOf(chat);
  if (helper === null) return <MainEmpty chatId={chat.id} name={name} live={live} />;
  return <HelperEmpty chatId={chat.id} helper={helper} live={live} />;
}

export function OlderHistoryLine({ loading }: { readonly loading: boolean }): ReactNode {
  if (!loading) return null;
  return (
    <View
      accessibilityLabel="Loading older messages"
      className="my-2 h-5 flex-row items-center justify-center"
    >
      <Spinner tone="faint" />
    </View>
  );
}

export function BlockedChat({ state }: { readonly state: BlockedAreaStatus }): ReactNode {
  switch (state.kind) {
    case 'loading':
      return (
        <Hero
          title="Connecting to your Home Hub"
          body="Your chats appear as soon as the connection is up."
        />
      );
    case 'offline-empty':
      return (
        <Hero
          title="Can’t reach your Home Hub"
          body="Your chats appear again as soon as it is reachable."
        >
          <Button label="Open server settings" href={href.settings.page('server')} />
        </Hero>
      );
  }
}
