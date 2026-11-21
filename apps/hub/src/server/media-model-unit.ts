import { storeUnit } from '../store/host/unit';

export const ATTACHMENT_CHAT_MODEL_UNIT = storeUnit(
  (store, { messageId }: { readonly messageId: string }): string | null => {
    const chat = store.aiChats.chat(store.assistantChat.message(messageId).chat_id);
    return chat.engine.kind === 'dsh' ? chat.engine.model : null;
  },
);
