import {
  TALK_KEEP_HOURS_DEFAULT,
  type TalkChannelRow,
  type TalkIcon,
  type TalkKeepHours,
  type TalkMemberKind,
  type TalkMemberRow,
  type TalkPriority,
} from '@smarteverything/domain';

export interface ChannelFields {
  readonly name: string;
  readonly icon: TalkIcon;
  readonly priority: TalkPriority;
  readonly keep_hours: TalkKeepHours;
}

export interface DraftMember {
  readonly kind: TalkMemberKind;
  readonly memberId: string;
  readonly listening: boolean;
}

export const NEW_CHANNEL: ChannelFields = {
  name: '',
  icon: 'radio',
  priority: 'normal',
  keep_hours: TALK_KEEP_HOURS_DEFAULT,
};

export function fieldsOf(channel: TalkChannelRow): ChannelFields {
  return {
    name: channel.name,
    icon: channel.icon,
    priority: channel.priority,
    keep_hours: channel.keep_hours,
  };
}

export function draftMembersOf(rows: readonly TalkMemberRow[]): readonly DraftMember[] {
  return rows.map((row) => ({
    kind: row.member_kind,
    memberId: row.member_id,
    listening: row.listening,
  }));
}

export function memberKey(kind: TalkMemberKind, memberId: string): string {
  return `${kind}/${memberId}`;
}

export const KEEP_OPTIONS: readonly { readonly value: string; readonly label: string }[] = [
  { value: '0', label: 'Don’t keep' },
  { value: '1', label: '1 hour' },
  { value: '24', label: '1 day' },
  { value: '168', label: '1 week' },
];

export const PRIORITY_OPTIONS: readonly { readonly value: TalkPriority; readonly label: string }[] =
  [
    { value: 'normal', label: 'Normal' },
    { value: 'urgent', label: 'Priority' },
  ];
