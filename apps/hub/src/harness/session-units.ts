import type { DshSessionMetadata } from '@smarteverything/domain';
import { projectNativeRelays } from '../assistant/engines/dsh/native-relay';
import { durableStoreUnit } from '../store/host/unit';
import {
  acquireHeld,
  createHeld,
  rewriteHeld,
  type HeldSessionOpen,
  type HeldSessionRewrite,
  type SessionAppend,
} from '../store/repositories/dsh-session-writes';
import type { Store } from '../store/store';
import { bindChildRoutes } from './child-route-binding';

function appended(store: Store, { input, authority, routes }: SessionAppend): DshSessionMetadata {
  return store.dshSessions.append(input, authority, (sessionId, events) => {
    bindChildRoutes(store, sessionId, routes);
    projectNativeRelays(store, sessionId, events);
  }).metadata;
}

export const SESSION_CREATE_UNIT = durableStoreUnit((store: Store, open: HeldSessionOpen) =>
  createHeld(store.dshSessions, open),
);

export const SESSION_ACQUIRE_UNIT = durableStoreUnit((store: Store, open: HeldSessionOpen) =>
  acquireHeld(store.dshSessions, open),
);

export const SESSION_REWRITE_UNIT = durableStoreUnit((store: Store, rewrite: HeldSessionRewrite) =>
  rewriteHeld(store.dshSessions, rewrite),
);

export const SESSION_APPEND_UNIT = durableStoreUnit(appended);
