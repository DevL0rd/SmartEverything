import { admitExecutionTarget, authorityScope, executionRole } from '../turn-authority';
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
import { messageOf } from '@smarteverything/logging';

const NOT_READY =
  'The selected AI engine is starting or unavailable; try again when it is connected.';

export class EngineRegistry {
  private readonly engines = new Map<EngineKind, Engine>();

  constructor(private readonly store: Store) {}

  attach(engine: Engine): void {
    this.engines.set(engine.kind, engine);
  }

  engineOf(chat: AiChatRow): Engine | null {
    return this.engines.get(chat.engine.kind) ?? null;
  }

  async activity(profileId: string): Promise<readonly ChatActivityNotice[]> {
    const lists = await Promise.all(
      [...this.engines.values()].map((engine) =>
        engine.kind === 'dsh' && engine.activity !== undefined
          ? engine.activity(profileId)
          : Promise.resolve([]),
      ),
    );
    return lists.flat();
  }

  forMutation(chat: AiChatRow, role: Role): Engine | null {
    const engine = this.engineOf(chat);
    if (engine?.ownerOnly === true && role !== 'owner')
      throw new ApiError('forbidden', 'Only the home owner can use Claude or Codex on computers.');
    return engine;
  }

  async route(event: StoredEvent): Promise<Routing> {
    const facts = await this.store.host.write('assistantDeliveryRoute', {
      event,
      held: this.store.live.chatWork.holds.held(),
      scope: authorityScope(),
    });
    if (!facts.ok) return { kind: 'blocked', reason: facts.reason };
    const { chat, authority } = facts;
    try {
      admitExecutionTarget(this.store, chat, authority);
      this.forMutation(chat, executionRole(authority));
    } catch (cause) {
      return {
        kind: 'blocked',
        reason: messageOf(cause),
      };
    }
    const engine = this.engineOf(chat);
    return engine === null ? { kind: 'waiting' } : { kind: 'engine', engine, chat, authority };
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
