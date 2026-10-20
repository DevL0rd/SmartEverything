import type { SessionHooks, SessionTarget } from './session-start';

export type RelayStarter = (target: SessionTarget, hooks: SessionHooks) => void;

export function relayStarter(): RelayStarter | null {
  return null;
}
