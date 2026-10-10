import type { ReactNode } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { href } from '../../../app-shell/hrefs';
import { EmptyChat } from '../components/chat-states';
import { Composer } from '../components/composer';
import { useAssistantName, useAssistantStatus } from '../data/assistant-data';
import { chatStarter } from './chat-actions';

export function StartChat({ split }: { readonly split: boolean }): ReactNode {
  const name = useAssistantName();
  const kind = useAssistantStatus()?.settings.default_engine ?? 'openrouter';
  const start = chatStarter({ kind, model: null, effort: null, worker_id: null }, (chatId) => {
    if (split) {
      router.setParams({ chat: chatId });
    } else {
      router.push(href.assistantChat(chatId));
    }
  });
  return (
    <View className="min-h-0 flex-1 justify-between pb-safe-offset-3">
      <View className="flex-1 justify-center">
        <EmptyChat name={name} send={start} />
      </View>
      <View className="w-full max-w-reading self-center px-gutter">
        <Composer
          disabled={false}
          placeholder={`Message ${name}`}
          draftKey="new-chat"
          send={start}
        />
      </View>
    </View>
  );
}
