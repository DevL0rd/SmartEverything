import {
  channelInScope,
  type LiveChange,
  type TalkChannelRow,
  type TalkMemberKind,
  type TalkMemberRow,
} from '@smarteverything/domain';
import { effectiveRow } from '../server/person-access';
import { scopesOfClient } from '../server/person-scope';
import type { Store } from '../store/store';

const TALK_TABLES: ReadonlySet<LiveChange['table']> = new Set(['talk_channels', 'talk_members']);

export class TalkMembership {
  private channels = new Map<string, TalkChannelRow>();
  private members: readonly TalkMemberRow[] = [];

  constructor(private readonly store: Store) {
    this.reload();
  }

  affects(change: LiveChange): boolean {
    return TALK_TABLES.has(change.table);
  }

  reload(): void {
    this.channels = new Map(this.store.talk.channels().map((row) => [row.id, row]));
    this.members = this.store.talk.members().filter((row) => this.may(row));
  }

  private may(row: TalkMemberRow): boolean {
    if (row.member_kind !== 'client') return true;
    const client = this.store.clients.find(row.member_id);
    if (client === undefined) return false;
    const scopes = scopesOfClient(this.store, effectiveRow(this.store, client));
    return scopes === null || channelInScope(scopes.channels, row.channel_id);
  }

  channel(channelId: string): TalkChannelRow | undefined {
    return this.channels.get(channelId);
  }

  isMember(channelId: string, kind: TalkMemberKind, memberId: string): boolean {
    return this.members.some(
      (row) =>
        row.channel_id === channelId && row.member_kind === kind && row.member_id === memberId,
    );
  }

  channelsOf(clientId: string): string[] {
    return this.members
      .filter((row) => row.member_kind === 'client' && row.member_id === clientId)
      .map((row) => row.channel_id);
  }

  hears(clientId: string, channelId: string): boolean {
    return this.members.some(
      (row) =>
        row.channel_id === channelId &&
        row.member_kind === 'client' &&
        row.member_id === clientId &&
        row.listening,
    );
  }

  speakerCameras(channelId: string): string[] {
    return this.members
      .filter(
        (row) => row.channel_id === channelId && row.member_kind === 'camera' && row.listening,
      )
      .map((row) => row.member_id);
  }

  memberCameras(channelId: string): string[] {
    return this.members
      .filter((row) => row.channel_id === channelId && row.member_kind === 'camera')
      .map((row) => row.member_id);
  }

  rank(channelId: string): number {
    return this.channels.get(channelId)?.priority === 'urgent' ? 1 : 0;
  }
}
