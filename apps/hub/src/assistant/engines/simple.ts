import { EngineUnavailableError, type Engine } from './engine';

const CODEX_LATER =
  'Codex chats are not available in this version yet; choose OpenRouter or Claude Code.';

export const CODEX_THREAD_ENGINE: Engine = {
  kind: 'codex-thread',
  status: () => ({ state: 'unavailable', reason: CODEX_LATER }),
  deliver: () => Promise.reject(new EngineUnavailableError(CODEX_LATER)),
  interrupt: () => Promise.reject(new EngineUnavailableError(CODEX_LATER)),
};
