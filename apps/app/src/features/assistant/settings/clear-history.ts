import { AI_CHAT_AREA_ENDPOINTS as C } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { api } from '../../../api/transport';
import { forgetOlderMessages } from '../data/history';

const log = new Logger('app.assistant');

export async function clearChatHistory(): Promise<void> {
  await api().call(C.clearAiChats, { query: { scope: 'profile' } });
  log.info('assistant.history_cleared', {});
  forgetOlderMessages();
}
