import {
  ApiError,
  type LiveChange,
  type TalkChannelRow,
  type TalkMemberKind,
  type TalkMemberRow,
} from '@smarteverything/domain';
import type { Store } from '../store/store';
import type { MemberLabel } from './labels';

const TALK_TABLES: ReadonlySet<LiveChange['table']> = new Set(['talk_channels', 'talk_members']);

export class TalkMembership {
  private channels = new Map<string, TalkChannelRow>();
  private members: readonly TalkMemberRow[] = [];
  private loads = Promise.resolve();

  constructor(private readonly store: Pick<Store, 'host'>) {}

  affects(change: LiveChange): boolean {
    return TALK_TABLES.has(change.table);
  }

  reload(): Promise<void> {
    const load = async (): Promise<void> => {
      const roster = await this.store.host.read('talkRoster', null);
      this.channels = new Map(roster.channels.map((row) => [row.id, row]));
      this.members = roster.members;
    };
    this.loads = this.loads.then(load, load);
    return this.loads;
  }

  labelOf(channelId: string, kind: TalkMemberKind, memberId: string): MemberLabel {
    const member = this.members.find(
      (row) =>
        row.channel_id === channelId && row.member_kind === kind && row.member_id === memberId,
    );
    if (member === undefined)
      throw new ApiError('not_found', `No ${kind} ${memberId} in talk channel ${channelId}.`);
    return { label: member.label, detail: member.detail };
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
