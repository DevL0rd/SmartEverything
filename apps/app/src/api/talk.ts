import {
  API_ENDPOINTS as E,
  type TalkChannelChange,
  type TalkChannelRow,
  type TalkMemberKind,
  type TalkNewChannel,
} from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { api } from './transport';

const log = new Logger('app.talk');

export interface TalkMemberTarget {
  readonly channelId: string;
  readonly kind: TalkMemberKind;
  readonly memberId: string;
}

export async function createTalkChannel(
  channel: Partial<TalkNewChannel> & Pick<TalkNewChannel, 'name'>,
): Promise<TalkChannelRow> {
  const row = await api().call(E.createTalkChannel, { body: channel });
  log.info('talk.channel_created', { channelId: row.id, members: channel.members?.length ?? 0 });
  return row;
}

export async function updateTalkChannel(
  channelId: string,
  change: TalkChannelChange,
): Promise<void> {
  await api().call(E.updateTalkChannel, { params: { channelId }, body: change });
  log.info('talk.channel_updated', { channelId, fields: Object.keys(change) });
}

export async function removeTalkChannel(channelId: string): Promise<void> {
  await api().call(E.removeTalkChannel, { params: { channelId } });
  log.info('talk.channel_removed', { channelId });
}

function paramsOf(target: TalkMemberTarget): {
  channelId: string;
  memberKind: TalkMemberKind;
  memberId: string;
} {
  return { channelId: target.channelId, memberKind: target.kind, memberId: target.memberId };
}

export async function setTalkMember(target: TalkMemberTarget, listening: boolean): Promise<void> {
  await api().call(E.setTalkMember, { params: paramsOf(target), body: { listening } });
  log.info('talk.member_set', { channelId: target.channelId, kind: target.kind, listening });
}

export async function removeTalkMember(target: TalkMemberTarget): Promise<void> {
  await api().call(E.removeTalkMember, { params: paramsOf(target) });
  log.info('talk.member_removed', { channelId: target.channelId, kind: target.kind });
}

export async function talkMessageUrl(messageId: string): Promise<string> {
  const [link] = await api().call(E.talkMessageLinks, { body: { ids: [messageId] } });
  if (link === undefined) {
    throw new Error(`The server returned no link for message ${messageId}.`);
  }
  return api().urlOf(link.url);
}

export async function removeTalkMessage(messageId: string): Promise<void> {
  await api().call(E.removeTalkMessage, { params: { messageId } });
  log.info('talk.message_removed', { messageId });
}
