import {
  channelInScope,
  type LiveChange,
  type TalkChannelRow,
  type TalkMemberRow,
  type TalkMessageRow,
} from '@smarteverything/domain';
import { effectiveRow } from '../server/person-access';
import { scopesOfClient } from '../server/person-scope';
import { storeUnit } from '../store/host/unit';
import type { Store } from '../store/store';
import { memberLabel, relabelledMembers } from './labels';

function mayHear(store: Store, row: TalkMemberRow): boolean {
  if (row.member_kind !== 'client') return true;
  const client = store.clients.find(row.member_id);
  if (client === undefined) return false;
  const scopes = scopesOfClient(store, effectiveRow(store, client));
  return scopes === null || channelInScope(scopes.channels, row.channel_id);
}

export interface TalkRoster {
  readonly channels: readonly TalkChannelRow[];
  readonly members: readonly TalkMemberRow[];
}

function roster(store: Store, _input: null): TalkRoster {
  return {
    channels: store.talk.channels(),
    members: store.talk.members().filter((row) => mayHear(store, row)),
  };
}

function relabel(store: Store, change: LiveChange): void {
  store.write(() => {
    relabelledMembers(store, change).forEach(([kind, id]) => {
      store.talk.relabel(kind, id, memberLabel(store, kind, id));
    });
  });
}

function prune(
  store: Store,
  input: { readonly channelId: string; readonly before: string },
): TalkMessageRow[] {
  return store.write(() => {
    const expired = store.talk.expired(input.channelId, input.before);
    expired.forEach((message) => store.talk.removeMessage(message.id));
    return expired;
  });
}

function clearUnfinished(
  store: Store,
  _input: null,
): { readonly removed: TalkMessageRow[]; readonly channels: TalkChannelRow[] } {
  return store.write(() => {
    const removed = store.talk.unfinished();
    removed.forEach((message) => store.talk.removeMessage(message.id));
    return { removed, channels: store.talk.channels() };
  });
}

export const TALK_ROSTER_UNIT = storeUnit(roster);
export const TALK_RELABEL_UNIT = storeUnit(relabel);
export const TALK_PRUNE_UNIT = storeUnit(prune);
export const TALK_CLEAR_UNFINISHED_UNIT = storeUnit(clearUnfinished);
