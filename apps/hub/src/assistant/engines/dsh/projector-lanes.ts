import { background } from '@smarteverything/logging';
import type { StoredEvent } from '../../../store/repositories/assistant-events';
import type { Store } from '../../../store/store';
import { CommandLanes } from '../../../commands/lanes';
import type { ConversationLog } from '../../conversation-log';

export class SettledLanes {
  private readonly lanes = new CommandLanes();
  private readonly running = new Set<Promise<void>>();

  run(key: string, work: () => Promise<void>): Promise<void> {
    const ran = this.lanes.run(key, work);
    this.running.add(ran);
    background(
      Promise.allSettled([ran]).then(() => {
        this.running.delete(ran);
      }),
      'dsh.event_lane_failed',
      { key },
    );
    return ran;
  }

  busy(): boolean {
    return this.running.size > 0;
  }

  pending(): readonly Promise<void>[] {
    return [...this.running];
  }
}

export async function markWorking(
  store: Pick<Store, 'host'>,
  conversation: ConversationLog,
  event: StoredEvent,
): Promise<void> {
  const messageId = event.message_id;
  if (messageId === null) return;
  const current = await store.host.call('assistantEvents', 'ofMessage', messageId);
  if (current?.id !== event.id) return;
  const message = await store.host.call('assistantChat', 'message', messageId);
  if (message.state !== 'queued' && message.state !== 'delivered') return;
  background(conversation.stateOf(messageId, 'working'), 'dsh.message_state_failed', {
    eventId: event.id,
  });
}
