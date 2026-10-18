import type { CallTranscript, CallTurn } from '@smarteverything/domain';
import { systemClock, type Cancel, type Clock } from '../clock';
import type { Store } from '../store/store';
import type { Speaker } from './call-link';

export interface CallRecordStart {
  readonly chatId: string;
  readonly profileId: string;
  readonly clientId: string | null;
  readonly author: string;
  readonly person: string;
}

export type RecordedTurn = CallTurn;

const SAVE_EVERY_MS = 3000;

function labelOf(speaker: Speaker, start: CallRecordStart): string {
  if (speaker === 'person') {
    return `${start.person}: `;
  }
  return speaker === 'assistant' ? `${start.author}: ` : '· ';
}

export class CallRecord {
  readonly messageId: string;
  private readonly turns: CallTurn[] = [];
  private pending: Cancel | null = null;
  private savedAt = 0;
  private final: string | null = null;

  constructor(
    private readonly store: Store,
    private readonly start: CallRecordStart,
    private readonly clock: Pick<Clock, 'now' | 'at'> = systemClock,
  ) {
    this.messageId = store.assistantChat.addMessage({
      profile_id: start.profileId,
      client_id: start.clientId,
      role: 'system',
      kind: 'call',
      author: start.author,
      text: '',
      attachments: [],
      state: null,
      reason: null,
      steps: [],
      step_states: [],
      reply_to: null,
      chat_id: start.chatId,
      origin: { source: 'voice', plugin_id: null, device_id: null, name: start.person },
      embeds: [],
      cost_micros: 0,
      model: null,
    }).id;
    store.aiChats.touched(start.chatId, 0);
  }

  add(turn: RecordedTurn): void {
    this.turns.push(turn);
    this.schedule();
  }

  transcript(): string {
    return this.final ?? this.text();
  }

  close(): void {
    this.pending?.();
    this.pending = null;
    this.final = this.text();
    this.store.assistantChat.updateMessage(this.messageId, {
      text: this.final,
      embeds: [this.embed()],
    });
    this.store.aiChats.touched(this.start.chatId, 0);
  }

  private schedule(): void {
    if (this.pending !== null) {
      return;
    }
    const wait = Math.max(0, this.savedAt + SAVE_EVERY_MS - this.clock.now().getTime());
    this.pending = this.clock.at(new Date(this.clock.now().getTime() + wait), () => {
      this.pending = null;
      this.savedAt = this.clock.now().getTime();
      this.store.assistantChat.updateMessage(this.messageId, { embeds: [this.embed()] });
    });
  }

  private embed(): CallTranscript {
    return { kind: 'call_transcript', turns: this.turns };
  }

  private text(): string {
    return this.turns.map((turn) => `${labelOf(turn.who, this.start)}${turn.text}`).join('\n');
  }
}
