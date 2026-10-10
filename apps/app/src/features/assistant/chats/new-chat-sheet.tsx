import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import {
  NEW_CHAT_TITLE,
  type AiChatRow,
  type Engine,
  type EngineKind,
} from '@smarteverything/domain';
import { useAssistantStatus } from '../data/assistant-data';

function engineOf(kind: EngineKind): Engine {
  return { kind, model: null, effort: null, worker_id: null };
}
import { Button } from '../../../components/button';
import { Sheet } from '../../../components/sheet';
import { TextField } from '../../../components/text-field';
import { newChat } from './chat-actions';
import { EnginePicker } from './engine-picker';

export function NewChatSheet({
  open,
  onClose,
  onCreated,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onCreated: (chat: AiChatRow) => void;
}): ReactNode {
  const [title, setTitle] = useState('');
  const backend = useAssistantStatus()?.settings.default_engine ?? 'openrouter';
  const [engine, setEngine] = useState<Engine>(engineOf(backend));
  const [busy, setBusy] = useState(false);
  const create = (): void => {
    setBusy(true);
    void newChat({ title: title.trim() === '' ? NEW_CHAT_TITLE : title.trim(), engine }).then(
      (chat) => {
        setBusy(false);
        if (chat !== null) {
          setTitle('');
          setEngine(engineOf(backend));
          onCreated(chat);
        }
      },
    );
  };
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="New chat"
      detents={['full']}
      scroll={false}
      footer={
        <Button label="Start chat" icon="messageCircle" loading={busy} onPress={create} grow />
      }
    >
      <View className="min-h-0 flex-1 gap-4">
        <TextField
          label="Name"
          value={title}
          onChange={setTitle}
          placeholder={NEW_CHAT_TITLE}
          onSubmit={create}
        />
        <EnginePicker engine={engine} onChange={setEngine} />
      </View>
    </Sheet>
  );
}
