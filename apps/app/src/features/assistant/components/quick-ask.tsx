import type { ReactNode } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { href } from '../../../app-shell/hrefs';
import { Sheet } from '../../../components/sheet';
import { Text } from '../../../components/text';
import { ValueStore, useValue } from '../../../design/external-store';
import { AssistantOrb } from '../call/orb';
import { useAssistantName, useChatState } from '../data/assistant-data';
import { sendMessageRow } from '../data/send';
import { Composer } from './composer';

const open = new ValueStore(false);

export function openQuickAsk(): void {
  open.set(true);
}

async function sendAndOpenChat(text: string, attachments: readonly string[]): Promise<boolean> {
  const row = await sendMessageRow(text, attachments);
  if (row === null) {
    return false;
  }
  router.navigate(href.assistantChat(row.chat_id));
  return true;
}

function close(): void {
  open.set(false);
}

export function QuickAskHost(): ReactNode {
  const shown = useValue(open);
  const name = useAssistantName();
  const state = useChatState();
  const ready = state.kind === 'ready';
  return (
    <Sheet open={shown} onClose={close} label={`Ask ${name}`} detents={['fit']} wide>
      <View className="gap-4">
        <View className="flex-row items-center gap-3">
          <AssistantOrb state="idle" size={32} />
          <Text variant="title-3">{ready ? `Ask ${name}` : `${name} isn’t ready`}</Text>
        </View>
        <Composer
          disabled={!ready}
          placeholder={`Message ${name}`}
          focusOnMount
          send={sendAndOpenChat}
          onSent={close}
        />
      </View>
    </Sheet>
  );
}
