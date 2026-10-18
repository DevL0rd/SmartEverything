import {
  admitExecutionTool,
  currentExecutionAuthority,
  foldAuthorities,
  withExecutionAuthority,
} from '../assistant/turn-authority';
import type { ConversationAuthority } from './authority-contract';
import type { Store } from '../store/store';
import type { EffectKind } from '../store/repositories/harness-effects';
export function effectAuthority(
  store: Store,
  kind: EffectKind,
  id: string,
): ConversationAuthority | undefined {
  const effect = store.harnessRecovery.effects.find(kind, id);
  if (effect === undefined) return undefined;
  return foldAuthorities(
    effect.authorities.flatMap((event) => store.harnessRecovery.authority(event) ?? []),
  );
}
function inherited(
  authority: ConversationAuthority | undefined,
): ConversationAuthority | undefined {
  return foldAuthorities(
    [authority, currentExecutionAuthority()].filter(
      (source): source is ConversationAuthority => source !== undefined,
    ),
  );
}
export function withEffectTool<T>(
  store: Store,
  authority: ConversationAuthority | undefined,
  tool: string,
  work: () => T,
): T {
  const combined = inherited(authority);
  if (combined !== undefined) admitExecutionTool(store, tool, combined);
  return withExecutionAuthority(combined, work);
}

export function withEffectAuthority<T>(
  store: Store,
  kind: EffectKind,
  id: string,
  work: () => T,
): T {
  return withExecutionAuthority(inherited(effectAuthority(store, kind, id)), work);
}
