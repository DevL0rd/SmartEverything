import type { Context } from '@deepseek-ai/cordis';
import { bindMemory } from '@smarteverything/harness/process';
import type { Store } from '../store/store';
import { HubMemoryAccess } from './access';
import type { MemoryService } from './service';
import { HarnessMemorySessions, messageOfEvent, type SessionCallers } from './sessions';

export function bindHubMemory(
  ctx: Context,
  store: Store,
  callers: SessionCallers,
  service: MemoryService,
): () => void {
  return bindMemory(
    ctx,
    new HubMemoryAccess(
      service,
      new HarnessMemorySessions(
        callers,
        messageOfEvent(store.assistantEvents),
        (id) => store.assistantChat.message(id).text,
      ),
    ),
  );
}
