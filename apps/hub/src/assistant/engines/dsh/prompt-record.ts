import type { Store } from '../../../store/store';

export interface PromptRecord {
  readonly deliveryId: string;
  readonly sessionId: string;
  readonly clientId: string | null;
  readonly startSeq: number;
}

export async function recordPrompt(
  store: Pick<Store, 'host'>,
  prompt: PromptRecord,
): Promise<void> {
  await store.host.call('harnessSessions', 'sender', prompt.sessionId, prompt.clientId);
  await store.host.call('harnessDeliveries', 'cut', prompt.deliveryId, prompt.startSeq);
}
