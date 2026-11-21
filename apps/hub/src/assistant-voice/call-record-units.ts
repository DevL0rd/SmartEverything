import type { CallTranscript } from '@smarteverything/domain';
import { storeUnit } from '../store/host/unit';
import type { NewAssistantMessage } from '../store/repositories/assistant-chat';

export const CALL_RECORD_OPEN_UNIT = storeUnit(
  (store, input: { readonly id: string; readonly row: NewAssistantMessage }): void => {
    store.write(() => {
      store.assistantChat.addMessage(input.row, undefined, input.id);
      store.aiChats.touched(input.row.chat_id, 0);
    });
  },
);

export const CALL_RECORD_SAVE_UNIT = storeUnit(
  (
    store,
    input: {
      readonly id: string;
      readonly chatId: string;
      readonly text: string | null;
      readonly embed: CallTranscript;
    },
  ): void => {
    store.write(() => {
      store.assistantChat.updateMessage(input.id, {
        ...(input.text === null ? {} : { text: input.text }),
        embeds: [input.embed],
      });
      if (input.text !== null) store.aiChats.touched(input.chatId, 0);
    });
  },
);
