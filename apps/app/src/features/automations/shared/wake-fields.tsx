import type { ReactNode } from 'react';
import { View } from 'react-native';
import { WAKE_INSTRUCTION_MAX, type WakeAiAction } from '@smarteverything/domain';
import { Select } from '../../../components/select';
import { TextField } from '../../../components/text-field';
import type { Catalog } from './catalog';

const NEW_CHAT = 'new';

function chatOptions(catalog: Catalog, profileId: string): { value: string; label: string }[] {
  return [
    { value: NEW_CHAT, label: 'A new chat each time' },
    ...catalog.chats
      .filter((chat) => chat.profile_id === profileId)
      .map((chat) => ({ value: chat.id, label: chat.title })),
  ];
}

export interface Wake {
  readonly profileId: string;
  readonly chatId: string | null;
  readonly instruction: string;
}

function WakeChoices({
  catalog,
  wake,
  onChange,
}: {
  readonly catalog: Catalog;
  readonly wake: Wake;
  readonly onChange: (wake: Wake) => void;
}): ReactNode {
  return (
    <View className="gap-3">
      <Select
        label="In which chat"
        value={wake.chatId ?? NEW_CHAT}
        options={chatOptions(catalog, wake.profileId)}
        searchable
        onChange={(chatId) => {
          onChange({ ...wake, chatId: chatId === NEW_CHAT ? null : chatId });
        }}
      />
      <TextField
        label="What should it do?"
        value={wake.instruction}
        multiline
        helper="It also gets what happened and the values, then decides how to help, like calling you."
        error={wake.instruction.length > WAKE_INSTRUCTION_MAX ? 'This is too long.' : null}
        onChange={(instruction) => {
          onChange({ ...wake, instruction });
        }}
      />
    </View>
  );
}

export function WakeFields({
  action,
  catalog,
  onChange,
}: {
  readonly action: WakeAiAction;
  readonly catalog: Catalog;
  readonly onChange: (action: WakeAiAction) => void;
}): ReactNode {
  return (
    <WakeChoices
      catalog={catalog}
      wake={action}
      onChange={(wake) => {
        onChange({ ...action, chatId: wake.chatId, instruction: wake.instruction });
      }}
    />
  );
}
