import { Logger } from '@smarteverything/logging';
import { randomUUID } from 'expo-crypto';
import { sendAiChatMessage } from '../../../api/ai';
import { notify } from '../../../components/toast-store';

const log = new Logger('app.approvals');

export async function sendInstruction(chatId: string, text: string): Promise<void> {
  const operation = log.operation('instruction.send', { chatId, length: text.length });
  try {
    await sendAiChatMessage(chatId, text, [], { clientMessageId: randomUUID() });
    operation.succeeded();
  } catch (error) {
    operation.failed(error);
    notify({ message: 'Instruction not sent', error, tone: 'critical' });
  }
}
