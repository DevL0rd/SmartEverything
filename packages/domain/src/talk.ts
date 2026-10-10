import { z } from 'zod';

const ID = z.uuid();
const MOMENT = z.iso.datetime({ offset: true });
const COUNT = z.int().min(0);

export const TALK_SAMPLE_RATE = 48_000;
export const TALK_FRAME_MS = 20;
export const TALK_START_TONE: readonly (readonly [number, number])[] = [
  [880, 0.05],
  [1320, 0.06],
];
export const TALK_END_TONE: readonly (readonly [number, number])[] = [
  [1320, 0.05],
  [880, 0.07],
];
export const TALK_FRAME_BYTES_MAX = 1276;
export const TALK_FRAMES_PER_SECOND_MAX = 60;
export const TALK_SECONDS_MAX = 60;
export const LISTEN_SECONDS_MAX = 600;
export const TALK_MESSAGES_SNAPSHOT = 100;
export const TALK_CHANNEL_NAME_MAX = 40;

export const TALK_ICONS = [
  'radio',
  'home',
  'users',
  'baby',
  'bed',
  'sofa',
  'utensils',
  'car',
  'bell',
  'shield',
] as const;

export type TalkIcon = (typeof TALK_ICONS)[number];

export const TALK_PRIORITIES = ['normal', 'urgent'] as const;

export type TalkPriority = (typeof TALK_PRIORITIES)[number];

export const TALK_KEEP_HOURS = [0, 1, 24, 168] as const;

export type TalkKeepHours = (typeof TALK_KEEP_HOURS)[number];

export const TALK_KEEP_HOURS_DEFAULT: TalkKeepHours = 24;

export const TALK_MEMBER_KINDS = ['client', 'camera'] as const;

export type TalkMemberKind = (typeof TALK_MEMBER_KINDS)[number];

export const TALK_MESSAGE_KINDS = ['talk', 'listen'] as const;

export type TalkMessageKind = (typeof TALK_MESSAGE_KINDS)[number];

export const TALK_CHANNEL_NAME = z.string().trim().min(1).max(TALK_CHANNEL_NAME_MAX);

export const TALK_ICON = z.enum(TALK_ICONS);

export const TALK_PRIORITY = z.enum(TALK_PRIORITIES);

export const TALK_KEEP = z.literal(TALK_KEEP_HOURS);

export const TALK_MEMBER_KIND = z.enum(TALK_MEMBER_KINDS);

export const TALK_CHANNEL_ROW = z.strictObject({
  id: ID,
  name: TALK_CHANNEL_NAME,
  icon: TALK_ICON,
  priority: TALK_PRIORITY,
  keep_hours: TALK_KEEP,
  ai_listens: z.boolean().default(true),
  position: z.int().min(0).max(1_000_000),
  created_at: MOMENT,
  updated_at: MOMENT,
});

export type TalkChannelRow = z.infer<typeof TALK_CHANNEL_ROW>;

export const TALK_MEMBER_ROW = z.strictObject({
  channel_id: ID,
  member_kind: TALK_MEMBER_KIND,
  member_id: ID,
  label: z.string().min(1).max(120),
  detail: z.string().max(120).nullable(),
  listening: z.boolean(),
  created_at: MOMENT,
});

export type TalkMemberRow = z.infer<typeof TALK_MEMBER_ROW>;

export function talkMemberKey(row: {
  readonly channel_id: string;
  readonly member_kind: TalkMemberKind;
  readonly member_id: string;
}): string {
  return `${row.channel_id}/${row.member_kind}/${row.member_id}`;
}

export const TALK_SPEAKER = z.strictObject({
  kind: TALK_MEMBER_KIND,
  id: ID,
  label: z.string().min(1).max(120),
  detail: z.string().max(120).nullable(),
});

export type TalkSpeaker = z.infer<typeof TALK_SPEAKER>;

export const TALK_MESSAGE_ROW = z.strictObject({
  id: ID,
  channel_id: ID,
  speaker_kind: TALK_MEMBER_KIND,
  speaker_id: ID,
  speaker_label: z.string().min(1).max(120),
  speaker_detail: z.string().max(120).nullable(),
  kind: z.enum(TALK_MESSAGE_KINDS),
  started_at: MOMENT,
  duration_ms: COUNT.nullable(),
  bytes: COUNT,
  storage_path: z.string().min(1).nullable(),
  transcript: z.string().min(1).nullable().default(null),
});

export type TalkMessageRow = z.infer<typeof TALK_MESSAGE_ROW>;

export const TALK_FLOOR = z.strictObject({
  channelId: ID,
  messageId: ID,
  kind: z.enum(TALK_MESSAGE_KINDS),
  speaker: TALK_SPEAKER,
  startedAt: MOMENT,
});

export type TalkFloor = z.infer<typeof TALK_FLOOR>;

export const TALK_PRESENCE = z.strictObject({
  floors: z.array(TALK_FLOOR),
  online: z.array(ID),
});

export type TalkPresence = z.infer<typeof TALK_PRESENCE>;

export const TALK_FLOORS_NOTICE = z.strictObject({
  type: z.literal('talk_floors'),
  ...TALK_PRESENCE.shape,
});

export type TalkFloorsNotice = z.infer<typeof TALK_FLOORS_NOTICE>;

export const TALK_STATUS = z.strictObject({
  channels: z.array(TALK_CHANNEL_ROW),
  members: z.array(TALK_MEMBER_ROW),
  messages: z.array(TALK_MESSAGE_ROW),
  ...TALK_PRESENCE.shape,
});

export type TalkStatus = z.infer<typeof TALK_STATUS>;
