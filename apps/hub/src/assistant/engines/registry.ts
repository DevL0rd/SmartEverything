import { admitExecutionTarget, eventAuthority, executionRole } from '../execution-authority';
import {
  ApiError,
  type Role,
  type AiChatRow,
  type EngineKind,
  type ChatActivityNotice,
} from '@smarteverything/domain';
import type { StoredEvent } from '../../store/repositories/assistant-events';
import type { Store } from '../../store/store';
import type { Routing } from '../delivery';
import type { Engine } from './engine';

const NOT_READY =
  'The selected AI engine is starting or unavailable; try again when it is connected.';

export class EngineRegistry {
  private readonly engines = new Map<EngineKind, Engine>();

  constructor(private readonly store: Store) {}

  attach(engine: Engine): void {
    this.engines.set(engine.kind, engine);
  }

  engineOf(chat: AiChatRow): Engine | null {
    return this.engines.get(chat.engine.kind === 'openrouter' ? 'dsh' : chat.engine.kind) ?? null;
  }

  activity(profileId: string): readonly ChatActivityNotice[] {
    return [...this.engines.values()].flatMap((engine) =>
      engine.kind === 'dsh' ? [...(engine.activity?.(profileId) ?? [])] : [],
    );
  }

  forMutation(chat: AiChatRow, role: Role): Engine | null {
    const engine = this.engineOf(chat);
    if (engine?.ownerOnly === true && role !== 'owner')
      throw new ApiError('forbidden', 'Only the owner may change or control native computer work.');
    return engine;
  }

  route(event: StoredEvent): Routing {
    const chat = this.store.aiChats.chat(event.chat_id);
    try {
      const authority = eventAuthority(this.store, event);
      admitExecutionTarget(this.store, chat, authority);
      this.forMutation(chat, executionRole(this.store, authority));
    } catch (cause) {
      return {
        kind: 'blocked',
        reason:
          cause instanceof Error ? cause.message : 'Initiating execution authority unavailable.',
      };
    }
    const engine = this.engineOf(chat);
    if (chat.engine.model === 'smarteverything/unavailable-computer-engine')
      return {
        kind: 'blocked',
        reason: 'Select an available supplying computer before sending work.',
      };
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
