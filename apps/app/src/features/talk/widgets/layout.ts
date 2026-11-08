import type { TalkMessageRow } from '@smarteverything/domain';
import type { WidgetSize } from '../../../components/widget-board';
import { TYPE_SCALE, type Idiom } from '../../../design/tokens';

export const CHANNELS_GAP = 8;
const OVERVIEW_GAP = 12;
export const AVATAR_SIZE = 32;
export const AVATAR_GAP = 4;
const HISTORY_GAP = 4;
const HISTORY_PAD_Y = 4;

const TALK_ROW = 48;
const BAND_GAP = 8;
export const CHANNEL_ROW = 48;
const CHANNEL_ROW_ICON = 20;
const CHANNEL_ROW_GAPS_AND_PADDING = 24;
const CHANNEL_LABEL_EM = 4;
const INLINE_COLUMN = 116;
const SURFACE_EDGES = 2;

function tracks(space: number, unit: number, gap: number): number {
  return Math.max(0, Math.floor((space + gap) / (unit + gap)));
}

export function channelGrid(
  width: number,
  idiom: Idiom,
  channels: number,
): { readonly columns: number; readonly itemWidth: number } {
  const label = CHANNEL_LABEL_EM * TYPE_SCALE[idiom].body[0];
  const minWidth = CHANNEL_ROW + CHANNEL_ROW_ICON + CHANNEL_ROW_GAPS_AND_PADDING + label;
  const innerWidth = width - SURFACE_EDGES;
  const columns = Math.max(1, Math.min(channels, tracks(innerWidth, minWidth, CHANNELS_GAP)));
  return {
    columns,
    itemWidth: Math.floor((innerWidth - (columns - 1) * CHANNELS_GAP) / columns),
  };
}

export function gridRows<T>(items: readonly T[], columns: number): readonly (readonly T[])[] {
  const rows: T[][] = [];
  for (let index = 0; index < items.length; index += columns) {
    rows.push(items.slice(index, index + columns));
  }
  return rows;
}

interface ChannelBodyBox {
  readonly width: number;
  readonly height: number;
  readonly idiom: Idiom;
}

export interface ChannelLayout {
  readonly inline: boolean;
  readonly activityLines: 1 | 2;
  readonly members: boolean;
  readonly memberWidth: number;
  readonly messages: number;
}

function overviewFit(
  room: number,
  line: number,
): Pick<ChannelLayout, 'activityLines' | 'members'> & { readonly used: number } {
  const members = room >= line + AVATAR_GAP + AVATAR_SIZE;
  const withMembers = members ? line + AVATAR_GAP + AVATAR_SIZE : line;
  const twoLines = room >= withMembers + line;
  return {
    members,
    activityLines: twoLines ? 2 : 1,
    used: twoLines ? withMembers + line : withMembers,
  };
}

export function channelLayout(
  size: WidgetSize,
  { width, height, idiom }: ChannelBodyBox,
  touchMin: number,
  hasMessages: boolean,
): ChannelLayout {
  const type = TYPE_SCALE[idiom];
  const innerWidth = width - SURFACE_EDGES;
  const room = height - TALK_ROW - BAND_GAP;
  const { used, ...overview } = overviewFit(room, type.callout[1]);
  const messageHeight = Math.max(touchMin, type.callout[1] + type.caption[1]);
  const fit = (space: number): number =>
    hasMessages ? tracks(space - 2 * HISTORY_PAD_Y, messageHeight, HISTORY_GAP) : 0;
  const beside = fit(room);
  const inline = size === 'W' && beside > 0 && innerWidth >= 2 * INLINE_COLUMN + OVERVIEW_GAP;
  return {
    inline,
    ...overview,
    memberWidth: inline ? (innerWidth - OVERVIEW_GAP) / 2 : innerWidth,
    messages: inline ? beside : fit(room - used - OVERVIEW_GAP),
  };
}

export function membersShown(count: number, width: number, idiom: Idiom): number {
  const all = tracks(width, AVATAR_SIZE, AVATAR_GAP);
  if (all >= count) return count;
  const captionSize = TYPE_SCALE[idiom].caption[0];
  const overflowLabelWidth = (String(count).length + 1) * captionSize;
  return Math.max(0, Math.floor((width - overflowLabelWidth) / (AVATAR_SIZE + AVATAR_GAP)));
}

export function historyRows<T extends Pick<TalkMessageRow, 'storage_path'>>(
  messages: readonly T[],
  limit: number,
  inline: boolean,
): readonly T[] {
  const playable =
    inline && limit === 1 ? messages.find((message) => message.storage_path !== null) : undefined;
  return playable === undefined ? messages.slice(0, limit) : [playable];
}
