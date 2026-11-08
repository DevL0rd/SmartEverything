import { ConversationLog } from '../../../../src/assistant/conversation-log';
import { ConversationProjector } from '../../../../src/assistant/engines/dsh/projector';
import type { StoredEvent } from '../../../../src/store/repositories/assistant-events';
import type { Rig } from './rig';

export function projectorOf(
  rig: Rig,
  finished: (event: StoredEvent, text: string, ok: boolean) => void = (): void => undefined,
): ConversationProjector {
  return new ConversationProjector(
    {
      service: rig.service,
      conversation: new ConversationLog(rig.opened.store),
      emit: (): void => undefined,
      finished,
    },
    (): void => undefined,
    (): void => undefined,
    (): Promise<void> => Promise.resolve(),
  );
}
