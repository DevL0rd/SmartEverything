import {
  LIVE_CONTEXT_MINUTES,
  type MessageOrigin,
  type TalkChannelRow,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { AssistantVoice } from '../assistant-voice/assistant-voice';
import { assistantNames } from '../assistant-voice/persona';
import type { Clock } from '../clock';
import type { ReachService } from '../reach/reach-service';
import { TalkListening, type TalkHeard } from '../talk/talk-listening';
import { talkContext, talkWakeText } from '../talk/talk-wake-text';
import { ListeningBudget } from '../transcripts/listening-budget';
import { ownerProfileOf } from '../transcripts/owner';
import type { ServerContext } from './context';
import type { Transcribing } from './transcribing';
import { messageOf } from '@smarteverything/logging';

const CONTEXT_ROWS = 50;
const REPLY_CHARACTERS_MAX = 1000;
const CONTEXT_WINDOW_MS = LIVE_CONTEXT_MINUTES.max * 60_000;

export interface TalkWiring {
  readonly clock: Clock;
  readonly log: Logger;
}

export interface TalkLinks {
  readonly transcribing: Pick<Transcribing, 'ears' | 'transcriber' | 'transcripts'>;
  readonly service: Pick<ReachService, 'speak'>;
  readonly voice: Pick<AssistantVoice, 'keys'>;
}

function originOf(channel: TalkChannelRow): MessageOrigin {
  return { source: 'wake', plugin_id: null, device_id: null, name: channel.name };
}

function dropWhenSuperseded(
  message: TalkHeard,
  eventId: string,
  pending: Map<string, TalkChannelRow>,
  log: Logger,
): void {
  message.onSuperseded((winner) => {
    pending.delete(eventId);
    log.info('talk.reply_dropped', {
      channelId: message.channel.id,
      eventId,
      winner: winner.source,
    });
  });
}

function wakeTurn(
  context: ServerContext,
  wiring: TalkWiring,
  pending: Map<string, TalkChannelRow>,
): (message: TalkHeard) => void {
  const { store, assistant } = context;
  const log = wiring.log.forArea('hub.talk');
  return (message): void => {
    const profileId = ownerProfileOf(store);
    const now = wiring.clock.now();
    const rows = store.talk
      .recentTranscripts(
        message.channel.id,
        new Date(now.getTime() - CONTEXT_WINDOW_MS).toISOString(),
        CONTEXT_ROWS,
      )
      .filter((row) => row.id !== message.messageId);
    const chat = assistant.chats.conversationChat(
      profileId,
      `Walkie-talkie · ${message.channel.name}`,
    );
    const text = talkWakeText({
      channel: message.channel,
      speaker: message.speaker.label,
      phrase: message.phrase,
      transcript: message.transcript,
      context: talkContext(
        rows,
        store.assistantChat.settings(),
        store.settings.read().time_zone,
        now,
      ),
    });
    const { eventId } = assistant.runTurn({
      profileId,
      chatId: chat.id,
      title: chat.title,
      text,
      origin: originOf(message.channel),
    });
    pending.set(eventId, message.channel);
    dropWhenSuperseded(message, eventId, pending, log);
    log.info('talk.woke', { channelId: message.channel.id, eventId });
  };
}

function speakReplies(
  context: ServerContext,
  links: Pick<TalkLinks, 'service'>,
  wiring: TalkWiring,
  pending: Map<string, TalkChannelRow>,
): void {
  const { store, assistant } = context;
  const log = wiring.log.forArea('hub.talk');
  assistant.onFinished((event, reply, ok) => {
    const channel = pending.get(event.id);
    if (channel === undefined) {
      return;
    }
    pending.delete(event.id);
    const text = reply.trim().slice(0, REPLY_CHARACTERS_MAX);
    if (!ok || text === '') {
      log.warn('talk.reply_unspoken', { channelId: channel.id, ok });
      return;
    }
    const asker: Parameters<ReachService['speak']>[0] = {
      profileId: ownerProfileOf(store),
      role: 'owner',
      clientId: null,
      chatId: event.chat_id,
    };
    links.service
      .speak(asker, { target: { kind: 'channel', channelId: channel.id }, text })
      .catch((cause: unknown) => {
        log.warn('talk.reply_failed', {
          channelId: channel.id,
          reason: messageOf(cause),
        });
      });
  });
}

export function startTalkListening(
  context: ServerContext,
  links: TalkLinks,
  wiring: TalkWiring,
): void {
  const { store } = context;
  const pending = new Map<string, TalkChannelRow>();
  speakReplies(context, links, wiring, pending);
  context.talk.attachListening(
    new TalkListening({
      store,
      ears: links.transcribing.ears,
      transcriber: links.transcribing.transcriber,
      budget: new ListeningBudget({
        store,
        transcripts: links.transcribing.transcripts,
        clock: wiring.clock,
      }),
      names: (): string[] => assistantNames(store),
      keyPresent: (): boolean => context.openRouter.keys.current() !== null,
      clock: wiring.clock,
      heard: wakeTurn(context, wiring, pending),
      log: wiring.log.forArea('hub.talk'),
    }),
  );
}
