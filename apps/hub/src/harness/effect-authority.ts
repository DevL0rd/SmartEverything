import {
  currentExecutionAuthority,
  foldAuthorities,
  withExecutionAuthority,
  executionToolAdmitted,
} from '../assistant/turn-authority';
import type { ConversationAuthority } from './authority-contract';
import type { Store } from '../store/store';
import type { EffectKind } from '../store/repositories/harness-effects';
export async function effectAuthority(
  store: Store,
  kind: EffectKind,
  id: string,
): Promise<ConversationAuthority | undefined> {
  const authorities = await store.host.read('harnessEffectAuthorities', { kind, id });
  return authorities === undefined ? undefined : foldAuthorities(authorities);
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
export async function withEffectTool<T>(
  store: Store,
  authority: ConversationAuthority | undefined,
  tool: string,
  work: () => Promise<T>,
): Promise<T> {
  const combined = inherited(authority);
  if (combined !== undefined) await executionToolAdmitted(store, tool, combined);
  return await withExecutionAuthority(combined, work);
}
