import { useEffect, useState, type ReactNode } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { TextInput, View } from 'react-native';
import { AI_CHAT_TITLE_MAX, type AiChatRow } from '@smarteverything/domain';
import { Icon } from '../../../components/icon';
import { IconButton } from '../../../components/icon-button';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { useFocusOnMount } from '../../../components/use-focus-on-mount';
import { changeChat } from '../chats/chat-actions';
import { useChatIdentity } from '../chats/chat-identity';
import { SourceMark } from '../chats/source-mark';
import { useDetailsClose } from './details-scope';
import { useMoment } from './use-moment';
import { background } from '@smarteverything/logging';

function TitleInput({
  value,
  onChange,
  onSave,
  onCancel,
}: {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly onSave: () => void;
  readonly onCancel: () => void;
}): ReactNode {
  const input = useFocusOnMount(true);
  return (
    <TextInput
      ref={input}
      value={value}
      onChangeText={onChange}
      onSubmitEditing={onSave}
      onBlur={onSave}
      onKeyPress={(event) => {
        if (event.nativeEvent.key === 'Escape') onCancel();
      }}
      maxLength={AI_CHAT_TITLE_MAX}
      selectTextOnFocus
      accessibilityLabel="Chat name"
      cursorColorClassName="accent-primary"
      selectionColorClassName="accent-primary"
      className="min-h-touch-min rounded-md border border-primary bg-surface-2 px-3 font-sans-semibold text-title-3 text-on-surface outline-none"
    />
  );
}

function InlineTitle({ chat }: { readonly chat: AiChatRow }): ReactNode {
  const [draft, setDraft] = useState<string | null>(null);
  const { operation } = useLocalSearchParams<{ operation?: string }>();
  const renameRequested = operation === 'rename';
  const [renameHandled, setRenameHandled] = useState(false);
  if (renameRequested !== renameHandled) {
    setRenameHandled(renameRequested);
    if (renameRequested) setDraft(chat.title);
  }
  useEffect(() => {
    if (renameRequested) router.setParams({ operation: undefined });
  }, [renameRequested]);
  const save = (): void => {
    const next = draft?.trim() ?? '';
    setDraft(null);
    if (next !== '' && next !== chat.title)
      background(changeChat(chat.id, { title: next }), 'chat.change_failed');
  };
  if (draft !== null) {
    return (
      <TitleInput
        value={draft}
        onChange={setDraft}
        onSave={save}
        onCancel={() => {
          setDraft(null);
        }}
      />
    );
  }
  return (
    <Interactive
      label={`${chat.title}. Rename`}
      onPress={() => {
        setDraft(chat.title);
      }}
      className="min-h-touch-min flex-row items-center gap-2 self-start rounded-md"
      layerClassName="rounded-md"
    >
      <Text variant="title-3" numberOfLines={1} className="shrink">
        {chat.title}
      </Text>
      <Icon name="pencil" size={16} tone="variant" />
    </Interactive>
  );
}

export function HeaderTitle({ chat }: { readonly chat: AiChatRow }): ReactNode {
  const identity = useChatIdentity(chat);
  const when = useMoment();
  const close = useDetailsClose();
  const facts = [
    identity.lead ?? 'App',
    `started ${when(chat.created_at)}`,
    chat.pinned ? 'pinned' : null,
    chat.archived_at === null ? null : 'archived',
  ];
  return (
    <View className="flex-row items-center gap-3 pl-4 pr-2">
      <SourceMark source={identity.source} size={40} />
      <View className="min-w-0 flex-1">
        <InlineTitle chat={chat} />
        <Text variant="footnote" tone="variant" numberOfLines={2}>
          {facts.filter((part) => part !== null).join(' · ')}
        </Text>
      </View>
      <IconButton icon="close" label="Close chat details" shortcut="Esc" onPress={close} />
    </View>
  );
}
