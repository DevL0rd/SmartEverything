import { ApiError } from '@smarteverything/domain';
import type { Store } from '../store/store';
import type { Engine } from './engines/engine';
import type { EngineRegistry } from './engines/registry';

export function engineAuxiliary(
  engines: EngineRegistry,
  store: Store,
): (chatId: string) => NonNullable<Engine['auxiliary']> | null {
  return (chatId): NonNullable<Engine['auxiliary']> | null => {
    const engine = engines.engineOf(store.aiChats.chat(chatId));
    if (engine === null)
      throw new ApiError(
        'claude_not_ready',
        'The selected engine is unavailable for auxiliary work.',
      );
    if (engine.ownerOnly && engine.auxiliary === undefined)
      throw new ApiError(
        'claude_not_ready',
        'The selected native engine does not supply auxiliary completion.',
      );
    return engine.auxiliary ?? null;
  };
}
