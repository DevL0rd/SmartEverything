import {
  TALK_CHANNEL_ROW,
  TALK_MEMBER_ROW,
  TALK_MESSAGE_ROW,
  type TalkChannelChange,
  type TalkChannelRow,
  type TalkMemberKind,
  type TalkMemberRow,
  type TalkMessageRow,
  type TalkNewChannel,
} from '@smarteverything/domain';
import { storedRow } from '../codec';
import { assignments, found, type StoreContext } from '../context';
import { flag } from '../sql';
import type { MemberLabel } from '../../talk/labels';

const STORED_CHANNEL = storedRow(TALK_CHANNEL_ROW, { flags: ['ai_listens'] });
const STORED_MEMBER = storedRow(TALK_MEMBER_ROW, { flags: ['listening'] });
const STORED_MESSAGE = storedRow(TALK_MESSAGE_ROW, {});

const CHANNEL_COLUMNS =
  'id, name, icon, priority, keep_hours, ai_listens, position, created_at, updated_at';
const MEMBER_COLUMNS = 'channel_id, member_kind, member_id, label, detail, listening, created_at';
const MESSAGE_COLUMNS =
  'id, channel_id, speaker_kind, speaker_id, speaker_label, speaker_detail, kind, started_at, duration_ms, bytes, storage_path, transcript';

export interface MemberKey {
  readonly channelId: string;
  readonly kind: TalkMemberKind;
  readonly memberId: string;
}

export type NewTalkMessage = Omit<
  TalkMessageRow,
  'duration_ms' | 'bytes' | 'storage_path' | 'transcript'
>;

export interface FinishedTalkMessage {
  readonly durationMs: number;
  readonly bytes: number;
  readonly storagePath: string | null;
}

export interface MessageQuery {
  readonly channelId?: string | undefined;
  readonly before?: string | undefined;
  readonly limit: number;
}

export class TalkRepository {
  constructor(private readonly context: StoreContext) {}

  channels(): TalkChannelRow[] {
    return this.context.sql.all(
      STORED_CHANNEL,
      `select ${CHANNEL_COLUMNS} from talk_channels order by position, name`,
    );
  }

  channel(id: string): TalkChannelRow {
    return found(
      this.context.sql.get(
        STORED_CHANNEL,
        `select ${CHANNEL_COLUMNS} from talk_channels where id = $id`,
        { id },
      ),
      'walkie-talkie channel',
      id,
    );
  }

  createChannel(input: Omit<TalkNewChannel, 'members'>): TalkChannelRow {
    return this.context.write(() => {
      const id = this.context.newId();
      const now = this.context.now();
      this.context.sql.run(
        'add the walkie-talkie channel',
        `insert into talk_channels (${CHANNEL_COLUMNS})
         values ($id, $name, $icon, $priority, $keep, $listens, $position, $now, $now)`,
        {
          id,
          name: input.name,
          icon: input.icon,
          priority: input.priority,
          keep: input.keep_hours,
          listens: flag(input.ai_listens),
          position: this.channels().length,
          now,
        },
      );
      const row = this.channel(id);
      this.context.changed('talk_channels', 'INSERT', row, null);
      return row;
    });
  }

  updateChannel(id: string, change: TalkChannelChange): TalkChannelRow {
    return this.context.write(() => {
      const before = this.channel(id);
      const set = assignments({
        ...change,
        ai_listens: change.ai_listens === undefined ? undefined : flag(change.ai_listens),
        updated_at: this.context.now(),
      });
      this.context.sql.run(
        'change the walkie-talkie channel',
        `update talk_channels set ${set.text} where id = $id`,
        { ...set.parameters, id },
      );
      const after = this.channel(id);
      this.context.changed('talk_channels', 'UPDATE', after, before);
      return after;
    });
  }

  removeChannel(id: string): TalkMessageRow[] {
    return this.context.write(() => {
      const before = this.channel(id);
      const messages = this.messages({ channelId: id, limit: Number.MAX_SAFE_INTEGER });
      const members = this.members().filter((member) => member.channel_id === id);
      this.context.sql.run(
        'remove the walkie-talkie channel',
        'delete from talk_channels where id = $id',
        {
          id,
        },
      );
      members.forEach((member) => {
        this.context.changed('talk_members', 'DELETE', null, member);
      });
      messages.forEach((message) => {
        this.context.changed('talk_messages', 'DELETE', null, message);
      });
      this.context.changed('talk_channels', 'DELETE', null, before);
      return messages;
    });
  }

  members(): TalkMemberRow[] {
    return this.context.sql.all(
      STORED_MEMBER,
      `select ${MEMBER_COLUMNS} from talk_members order by channel_id, member_kind, created_at`,
    );
  }

  member(key: MemberKey): TalkMemberRow | undefined {
    return this.context.sql.get(
      STORED_MEMBER,
      `select ${MEMBER_COLUMNS} from talk_members
       where channel_id = $channel and member_kind = $kind and member_id = $member`,
      { channel: key.channelId, kind: key.kind, member: key.memberId },
    );
  }

  setMember(key: MemberKey, listening: boolean, label: MemberLabel): TalkMemberRow {
    return this.context.write(() => {
      this.channel(key.channelId);
      const before = this.member(key) ?? null;
      this.context.sql.run(
        'save the walkie-talkie member',
        `insert into talk_members (${MEMBER_COLUMNS})
         values ($channel, $kind, $member, $label, $detail, $listening, $now)
         on conflict (channel_id, member_kind, member_id) do update set listening = excluded.listening,
           label = excluded.label, detail = excluded.detail`,
        {
          channel: key.channelId,
          kind: key.kind,
          member: key.memberId,
          label: label.label,
          detail: label.detail,
          listening: flag(listening),
          now: this.context.now(),
        },
      );
      const after = found(this.member(key), 'walkie-talkie member', key.memberId);
      this.context.changed('talk_members', before === null ? 'INSERT' : 'UPDATE', after, before);
      return after;
    });
  }

  removeMember(key: MemberKey): void {
    this.context.write(() => {
      const before = found(this.member(key), 'walkie-talkie member', key.memberId);
      this.context.sql.run(
        'remove the walkie-talkie member',
        `delete from talk_members
         where channel_id = $channel and member_kind = $kind and member_id = $member`,
        { channel: key.channelId, kind: key.kind, member: key.memberId },
      );
      this.context.changed('talk_members', 'DELETE', null, before);
    });
  }

  relabel(kind: TalkMemberKind, memberId: string, label: MemberLabel): void {
    this.context.write(() => {
      for (const member of this.members()) {
        const same = member.label === label.label && member.detail === label.detail;
        if (member.member_kind === kind && member.member_id === memberId && !same) {
          this.setMember({ channelId: member.channel_id, kind, memberId }, member.listening, label);
        }
      }
    });
  }

  forgetMember(kind: TalkMemberKind, memberId: string): void {
    this.context.write(() => {
      for (const member of this.members()) {
        if (member.member_kind === kind && member.member_id === memberId) {
          this.removeMember({ channelId: member.channel_id, kind, memberId });
        }
      }
    });
  }

  startMessage(message: NewTalkMessage): TalkMessageRow {
    return this.context.write(() => {
      this.context.sql.run(
        'save the walkie-talkie message',
        `insert into talk_messages (${MESSAGE_COLUMNS})
         values ($id, $channel, $speakerKind, $speakerId, $label, $detail, $kind, $startedAt, null, 0, null, null)`,
        {
          id: message.id,
          channel: message.channel_id,
          speakerKind: message.speaker_kind,
          speakerId: message.speaker_id,
          label: message.speaker_label,
          detail: message.speaker_detail,
          kind: message.kind,
          startedAt: message.started_at,
        },
      );
      const row = this.message(message.id);
      this.context.changed('talk_messages', 'INSERT', row, null);
      return row;
    });
  }

  finishMessage(id: string, finished: FinishedTalkMessage): TalkMessageRow {
    return this.context.write(() => {
      const before = this.message(id);
      this.context.sql.run(
        'finish the walkie-talkie message',
        `update talk_messages set duration_ms = $duration, bytes = $bytes, storage_path = $path
         where id = $id`,
        { id, duration: finished.durationMs, bytes: finished.bytes, path: finished.storagePath },
      );
      const after = this.message(id);
      this.context.changed('talk_messages', 'UPDATE', after, before);
      return after;
    });
  }

  setTranscript(id: string, transcript: string): TalkMessageRow | null {
    return this.context.write(() => {
      const before = this.findMessage(id);
      if (before === undefined) {
        return null;
      }
      this.context.sql.run(
        'save the walkie-talkie transcript',
        'update talk_messages set transcript = $transcript where id = $id',
        { id, transcript },
      );
      const after = this.message(id);
      this.context.changed('talk_messages', 'UPDATE', after, before);
      return after;
    });
  }

  recentTranscripts(channelId: string, since: string, limit: number): TalkMessageRow[] {
    return this.context.sql
      .all(
        STORED_MESSAGE,
        `select ${MESSAGE_COLUMNS} from talk_messages
         where channel_id = $channel and transcript is not null and started_at >= $since
         order by started_at desc limit $limit`,
        { channel: channelId, since, limit },
      )
      .reverse();
  }

  findMessage(id: string): TalkMessageRow | undefined {
    return this.context.sql.get(
      STORED_MESSAGE,
      `select ${MESSAGE_COLUMNS} from talk_messages where id = $id`,
      { id },
    );
  }

  message(id: string): TalkMessageRow {
    return found(this.findMessage(id), 'walkie-talkie message', id);
  }

  messages(query: MessageQuery): TalkMessageRow[] {
    return this.context.sql.all(
      STORED_MESSAGE,
      `select ${MESSAGE_COLUMNS} from talk_messages
       where ($channel is null or channel_id = $channel) and ($before is null or started_at < $before)
       order by started_at desc limit $limit`,
      { channel: query.channelId ?? null, before: query.before ?? null, limit: query.limit },
    );
  }

  expired(channelId: string, startedBefore: string): TalkMessageRow[] {
    return this.context.sql.all(
      STORED_MESSAGE,
      `select ${MESSAGE_COLUMNS} from talk_messages
       where channel_id = $channel and started_at < $before and duration_ms is not null`,
      { channel: channelId, before: startedBefore },
    );
  }

  unfinished(): TalkMessageRow[] {
    return this.context.sql.all(
      STORED_MESSAGE,
      `select ${MESSAGE_COLUMNS} from talk_messages where duration_ms is null`,
    );
  }

  removeMessage(id: string): TalkMessageRow {
    return this.context.write(() => {
      const before = this.message(id);
      this.context.sql.run(
        'remove the walkie-talkie message',
        'delete from talk_messages where id = $id',
        {
          id,
        },
      );
      this.context.changed('talk_messages', 'DELETE', null, before);
      return before;
    });
  }
}
