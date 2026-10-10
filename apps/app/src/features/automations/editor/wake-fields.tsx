import type { ReactNode } from 'react';
import { View } from 'react-native';
import { WAKE_INSTRUCTION_MAX, type ToolAction, type WakeAiAction } from '@smarteverything/domain';
import { Select } from '../../../components/select';
import { Text } from '../../../components/text';
import { TextField } from '../../../components/text-field';
import type { Catalog } from '../data/use-automations';
import { toolLabel } from '../model/describe';

const NEW_CHAT = 'new';

function chatOptions(catalog: Catalog, profileId: string): { value: string; label: string }[] {
  return [
    { value: NEW_CHAT, label: 'A new chat each time' },
    ...catalog.chats
      .filter((chat) => chat.profile_id === profileId)
      .map((chat) => ({ value: chat.id, label: chat.title })),
  ];
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
    <View className="gap-3">
      <Select
        label="Whose AI"
        value={
          catalog.people.some((person) => person.id === action.profileId) ? action.profileId : null
        }
        placeholder="Pick a person"
        options={catalog.people.map((person) => ({ value: person.id, label: person.name }))}
        onChange={(profileId) => {
          onChange({ ...action, profileId, chatId: null });
        }}
      />
      <Select
        label="In which chat"
        value={action.chatId ?? NEW_CHAT}
        options={chatOptions(catalog, action.profileId)}
        searchable
        onChange={(chatId) => {
          onChange({ ...action, chatId: chatId === NEW_CHAT ? null : chatId });
        }}
      />
      <TextField
        label="What should it do?"
        value={action.instruction}
        multiline
        helper="It also gets what happened and the values, then decides how to help, like calling you."
        error={action.instruction.length > WAKE_INSTRUCTION_MAX ? 'This is too long.' : null}
        onChange={(instruction) => {
          onChange({ ...action, instruction });
        }}
      />
    </View>
  );
}

export function ToolActionSummary({
  action,
  catalog,
}: {
  readonly action: ToolAction;
  readonly catalog: Catalog;
}): ReactNode {
  const person =
    catalog.people.find((row) => row.id === action.profileId)?.name ?? 'someone removed';
  const details = Object.keys(action.args).length;
  return (
    <Text variant="callout" tone="variant">
      {`Uses “${toolLabel(action.tool)}” for ${person}${
        details === 0 ? '' : ` with ${String(details)} detail${details === 1 ? '' : 's'}`
      }. The AI set this up; ask it to change it.`}
    </Text>
  );
}
