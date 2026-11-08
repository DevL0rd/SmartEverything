import { background } from '@smarteverything/logging';
import type { CallLink } from './call-link';
import type { ConversationHooks } from './conversation-hooks';
import type { VoiceTools } from './conversation-tools';
import type { LiveEvents } from './gemini';
import type { IdleClock } from './idle-clock';
import type { LiveRenewal } from './live-renewal';
import type { ModelReplies } from './model-replies';
import type { SessionRenewer } from './conversation-renew';
import type { ReplyWatchdog } from './reply-watchdog';
import type { TurnText } from './turn-text';
import type { TurnTimer } from './turn-timing';
import type { TurnTrace } from './turn-trace';

export interface ConversationEventPorts {
  readonly model: string;
  readonly hooks: ConversationHooks;
  readonly link: CallLink;
  readonly renewal: LiveRenewal;
  readonly renewer: SessionRenewer;
  readonly replies: ModelReplies;
  readonly watchdog: ReplyWatchdog;
  readonly idle: IdleClock;
  readonly timing: TurnTimer;
  readonly text: TurnText;
  readonly tools: VoiceTools;
  readonly turns: TurnTrace;
  readonly play: (pcm: Int16Array) => void;
  readonly cut: () => void;
  readonly finishTurn: () => void;
}

export function conversationEvents(ports: ConversationEventPorts): Required<LiveEvents> {
  const { replies, turns, link, text } = ports;
  return {
    audio: (pcm): void => {
      turns.output('audio');
      replies.output();
      ports.play(pcm);
    },
    said: (words): void => {
      turns.output('text');
      replies.output();
      link.caption('assistant', text.said(words));
    },
    heard: (words): void => {
      if (!replies.answering) {
        ports.watchdog.heard();
      }
      ports.idle.heard();
      turns.heard(words.length);
      ports.timing.heard();
      link.caption('person', text.heard(words));
    },
    interrupted: (): void => {
      ports.cut();
    },
    turnComplete: (): void => {
      ports.finishTurn();
      turns.completed();
    },
    tool: (id, name, args): void => {
      turns.output('tool');
      replies.output();
      ports.tools.handle(id, name, args);
    },
    resumable: (handle): void => {
      ports.renewal.resumable(handle);
    },
    goAway: (): void => {
      ports.renewal.want('go_away');
    },
    usage: (usage): void => {
      ports.hooks.usage(usage, ports.model);
    },
    closed: (reason, code): void => {
      background(ports.renewer.renew('dropped', { reason, code }), 'conversation.renew_failed');
    },
  };
}
