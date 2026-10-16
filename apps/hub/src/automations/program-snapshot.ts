import {
  ApiError,
  JSON_VALUE,
  SCENE_ACTIONS,
  jsonEquals,
  type Action,
  type AutomationSequenceRow,
  type CommandAction,
} from '@smarteverything/domain';
import type { ConversationAuthority } from '../harness/authority-contract';
import { effectAuthorities } from '../harness/effect-authority';
import { profileIdOf } from '../server/auth';
import { currentControlCaller } from '../server/local-control-context';
import type { Store } from '../store/store';
import { automationProgram, programActions, type AutomationProgram } from './program';

export interface ProgramSnapshot {
  readonly program: AutomationProgram;
  readonly scenes: Readonly<Record<string, readonly CommandAction[]>>;
  readonly authorities: readonly {
    readonly id: string;
    readonly revision: string;
    readonly sources: readonly ConversationAuthority[];
  }[];
}
export function snapshotProgram(
  store: Store,
  actions: readonly Action[],
  sequence?: AutomationSequenceRow,
): ProgramSnapshot {
  const program = automationProgram(store, actions, sequence?.id);
  const sequences = [...program.sequences.values(), ...(sequence === undefined ? [] : [sequence])];
  return {
    program,
    scenes: Object.fromEntries(
      programActions(program).flatMap((action) =>
        action.type === 'scene'
          ? [[action.sceneId, SCENE_ACTIONS.parse(store.scenes.byId(action.sceneId).actions)]]
          : [],
      ),
    ),
    authorities: sequences.map((row) => ({
      id: row.id,
      revision: row.revision,
      sources: effectAuthorities(store, 'sequence', row.id),
    })),
  };
}
export function authorityEvents(sources: readonly ConversationAuthority[]): string[] {
  return sources.map((source) => source.event_id);
}
export function validateProgramSnapshot(store: Store, snapshot: ProgramSnapshot): void {
  for (const [id, actions] of Object.entries(snapshot.scenes)) {
    if (!jsonEquals(store.scenes.byId(id).actions, JSON_VALUE.parse(actions)))
      throw new ApiError('conflict', 'A referenced scene changed during this run.');
  }
  for (const row of snapshot.authorities) {
    if (store.automationSequences.byId(row.id).revision !== row.revision)
      throw new ApiError('conflict', 'A sequence changed during this run.');
    const current = effectAuthorities(store, 'sequence', row.id);
    if (!jsonEquals(authorityEvents(current), authorityEvents(row.sources)))
      throw new ApiError('forbidden', 'Sequence authorization changed.');
  }
}
export function runOwner(store: Store, kind: 'automation' | 'sequence', id: string): string | null {
  const caller = currentControlCaller();
  return caller === undefined
    ? (store.harnessRecovery.effects.find(kind, id)?.profile_id ?? null)
    : profileIdOf(store, caller);
}
