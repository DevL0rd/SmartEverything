import { withNativeEnrollment } from './hub-network';
import { NativeModule, requireOptionalNativeModule } from 'expo';
import { TALK_DENIALS, TALK_ENDINGS, TALK_SPEAKER } from '@smarteverything/domain';
import { z } from 'zod';
import { AppUpdateNeededError } from './health-connect';

const NULLABLE_ID = z.string().min(1).nullable();

export const TALK_NATIVE_STATE = z.strictObject({
  link: z.enum(['off', 'connecting', 'ready', 'offline', 'unsupported']),
  problem: z.string().nullable(),
  transmit: z.strictObject({
    status: z.enum(['idle', 'requesting', 'talking']),
    channelId: NULLABLE_ID,
    messageId: NULLABLE_ID,
    cameraId: NULLABLE_ID,
    startedAt: z.number().nullable(),
    limitSeconds: z.number().nullable(),
  }),
  receive: z
    .strictObject({
      channelId: z.string().min(1),
      messageId: z.string().min(1),
      speaker: TALK_SPEAKER,
      startedAt: z.number(),
    })
    .nullable(),
  level: z.number().min(0).max(1),
  lastDenial: z
    .strictObject({ channelId: z.string().min(1), reason: z.enum(TALK_DENIALS) })
    .nullable(),
  lastEnding: z.enum(TALK_ENDINGS).nullable(),
  live: z
    .strictObject({
      channelId: z.string().min(1),
      conversationId: z.string().min(1),
      label: z.string().min(1),
    })
    .nullable()
    .default(null),
  talkChannel: z.string(),
});

export type TalkNativeState = z.infer<typeof TALK_NATIVE_STATE>;

export interface TalkChannelName {
  readonly id: string;
  readonly name: string;
}

interface TalkEvents {
  readonly onTalkState: (payload: unknown) => void;
  readonly [event: string]: (payload: unknown) => void;
}

declare class TalkNative extends NativeModule<TalkEvents> {
  configureTalk(serverUrl: string, token: string, enrollment: string): Promise<void>;
  startTalk(): Promise<void>;
  stopTalk(): Promise<void>;
  pressTalk(channelId: string): Promise<void>;
  listenTalk(channelId: string, cameraId: string): Promise<void>;
  releaseTalk(): Promise<void>;
  setTalkChannels(channelsJson: string, talkChannel: string): Promise<void>;
  setHeadsetButton(on: boolean): Promise<void>;
  talkState(): Promise<unknown>;
}

type TalkName = Exclude<keyof TalkNative, keyof NativeModule<TalkEvents>> | 'addListener';

const talk = requireOptionalNativeModule<TalkNative>('Talk');

function talkFor(operation: TalkName): TalkNative {
  if (talk === null || typeof Reflect.get(talk, operation) !== 'function') {
    throw new AppUpdateNeededError(`walkie-talkie (${operation})`);
  }
  return talk;
}

export function talkLinked(): boolean {
  return talk !== null;
}

export async function configureTalk(serverUrl: string, token: string): Promise<void> {
  const source = talkFor('configureTalk');
  await withNativeEnrollment(serverUrl, token, (enrollment) =>
    source.configureTalk(serverUrl, token, enrollment),
  );
}

export async function startTalk(): Promise<void> {
  await talkFor('startTalk').startTalk();
}

export async function stopTalk(): Promise<void> {
  await talkFor('stopTalk').stopTalk();
}

export async function pressTalk(channelId: string): Promise<void> {
  await talkFor('pressTalk').pressTalk(channelId);
}

export async function listenTalk(channelId: string, cameraId: string): Promise<void> {
  await talkFor('listenTalk').listenTalk(channelId, cameraId);
}

export async function releaseTalk(): Promise<void> {
  await talkFor('releaseTalk').releaseTalk();
}

export async function setTalkChannels(
  channels: readonly TalkChannelName[],
  talkChannel: string,
): Promise<void> {
  await talkFor('setTalkChannels').setTalkChannels(JSON.stringify(channels), talkChannel);
}

export async function setHeadsetButton(on: boolean): Promise<void> {
  await talkFor('setHeadsetButton').setHeadsetButton(on);
}

export async function talkState(): Promise<TalkNativeState> {
  return TALK_NATIVE_STATE.parse(await talkFor('talkState').talkState());
}

export function addTalkStateListener(listener: (state: TalkNativeState) => void): {
  readonly remove: () => void;
} {
  return talkFor('addListener').addListener('onTalkState', (payload) => {
    listener(TALK_NATIVE_STATE.parse(payload));
  });
}
