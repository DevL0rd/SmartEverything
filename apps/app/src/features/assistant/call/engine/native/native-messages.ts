import type { AssistantVoiceClientMessage } from '@smarteverything/domain';
import { sendAssistantCallMessage } from '../../../../../../modules/health-connect';

class CallConnectionDownError extends Error {
  override readonly name = 'CallConnectionDownError';

  constructor(readonly messageType: string) {
    super(`The ${messageType} message was not sent because the connection to your home is down`);
  }
}

export async function postCallMessage(message: AssistantVoiceClientMessage): Promise<void> {
  const sent = await sendAssistantCallMessage(JSON.stringify(message));
  if (!sent) {
    throw new CallConnectionDownError(message.type);
  }
}
