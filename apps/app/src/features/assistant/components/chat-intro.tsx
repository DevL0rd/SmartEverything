import type { ReactNode } from 'react';
import { memo } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import type { AiChatRow } from '@smarteverything/domain';
import { Icon, type IconName } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { clock, dayLabel } from '../../../format/time';
import { useMinute } from '../../../store/clock';
import { useStoreSelector } from '../../../store/store-context';
import { useChatIdentity } from '../chats/chat-identity';
import { SourceMark } from '../chats/source-mark';
import { introLineOf } from '../model/chat-intro';
import { useChatModel } from '../chats/chat-model';

function IntroChip({
  icon,
  label,
}: {
  readonly icon: IconName;
  readonly label: string;
}): ReactNode {
  return (
    <Interactive
      label={`${label}. Open chat details`}
      onPress={() => {
        router.setParams({ sheet: 'chat' });
      }}
      className="min-h-touch-min flex-row items-center gap-1.5 rounded-full bg-surface-2 px-3"
      layerClassName="rounded-full"
    >
      <Icon name={icon} size={16} tone="variant" />
      <Text variant="caption" tone="variant" numberOfLines={1}>
        {label}
      </Text>
    </Interactive>
  );
}

function ChatIntroBase({ chat }: { readonly chat: AiChatRow }): ReactNode {
  const model = useChatModel(chat.engine);
  const now = useMinute();
  const timeZone = useStoreSelector((state) => state.settings?.time_zone ?? null);
  const { source, parent } = useChatIdentity(chat);
  const when = `${dayLabel(chat.created_at, now, timeZone)} ${clock(chat.created_at, timeZone)}`;
  return (
    <View className="items-center gap-1.5 px-4 pb-4 pt-8">
      <SourceMark source={source} size={40} />
      <Text variant="title-2" align="center">
        {chat.title}
      </Text>
      <Text variant="footnote" tone="variant" align="center">
        {introLineOf(source, parent?.title ?? null, when)}
      </Text>
      <View className="flex-row flex-wrap justify-center gap-1.5 pt-1.5">
        <IntroChip icon="sparkles" label={model.name} />
        {chat.pinned ? <IntroChip icon="pin" label="Pinned" /> : null}
      </View>
    </View>
  );
}

function sameIntro(
  left: { readonly chat: AiChatRow },
  right: { readonly chat: AiChatRow },
): boolean {
  const [a, b] = [left.chat, right.chat];
  return (
    a === b ||
    (a.id === b.id &&
      a.title === b.title &&
      a.created_at === b.created_at &&
      a.pinned === b.pinned &&
      a.engine === b.engine &&
      a.parent_id === b.parent_id &&
      a.kind === b.kind &&
      a.origin === b.origin &&
      a.source_key === b.source_key)
  );
}

export const ChatIntro = memo(ChatIntroBase, sameIntro);
