import type { AiChatRow, EngineKind } from '@smarteverything/domain';
import type { StoredEvent } from '../../store/repositories/assistant-events';
import type { Store } from '../../store/store';
import type { Routing } from '../delivery';
import type { Engine } from './engine';

const NOT_READY = 'OpenRouter is starting; try again in a moment.';

export class EngineRegistry {
  private readonly engines = new Map<EngineKind, Engine>();

  constructor(private readonly store: Store) {}

  attach(engine: Engine): void {
    this.engines.set(engine.kind, engine);
  }

  engineOf(chat: AiChatRow): Engine | null {
    return this.engines.get(chat.engine.kind) ?? null;
  }

  route(event: StoredEvent): Routing {
    const chat = this.store.aiChats.chat(event.chat_id);
    const engine = this.engineOf(chat);
    return engine === null
      ? { kind: 'blocked', reason: NOT_READY }
      : { kind: 'engine', engine, chat };
  }

  ready(chat: AiChatRow): string | null {
    const engine = this.engineOf(chat);
    if (engine === null) {
      return NOT_READY;
    }
    const status = engine.status(chat);
    return status.state === 'unavailable' ? status.reason : null;
  }
}
