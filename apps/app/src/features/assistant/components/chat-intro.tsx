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
import { appChatHistoryOnly } from '../chats/chat-visibility';

const CHIP = 'min-h-touch-min flex-row items-center gap-1.5 rounded-full bg-surface-2 px-3';

function IntroChip({
  icon,
  label,
  onPress,
}: {
  readonly icon: IconName;
  readonly label: string;
  readonly onPress?: () => void;
}): ReactNode {
  const content = (
    <>
      <Icon name={icon} size={16} tone="variant" />
      <Text variant="caption" tone="variant" numberOfLines={1}>
        {label}
      </Text>
    </>
  );
  if (onPress === undefined) return <View className={CHIP}>{content}</View>;
  return (
    <Interactive
      label={`Change model. ${label}`}
      onPress={onPress}
      className={CHIP}
      layerClassName="rounded-full"
    >
      {content}
    </Interactive>
  );
}

function ChatIntroBase({ chat }: { readonly chat: AiChatRow }): ReactNode {
  const model = useChatModel(chat.engine);
  const now = useMinute();
  const timeZone = useStoreSelector((state) => state.settings?.time_zone ?? null);
  const { source, parent } = useChatIdentity(chat);
  const historyOnly = appChatHistoryOnly(chat);
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
        <IntroChip
          icon="sparkles"
          label={model.name}
          {...(historyOnly ? {} : { onPress: openModel })}
        />
        {chat.pinned ? <IntroChip icon="pin" label="Pinned" /> : null}
      </View>
    </View>
  );
}

function openModel(): void {
  router.setParams({ operation: 'model' });
}

function sameIntroSource(left: AiChatRow, right: AiChatRow): boolean {
  return (
    left.parent_id === right.parent_id &&
    left.kind === right.kind &&
    left.origin === right.origin &&
    left.source_key === right.source_key
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
      a.native_admission === b.native_admission &&
      sameIntroSource(a, b))
  );
}

export const ChatIntro = memo(ChatIntroBase, sameIntro);
