import { ASSISTANT_TEXT_MAX, type CallTranscript, type CallTurn } from '@smarteverything/domain';
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

const TURN_TEXT_MAX = 2000;
const TURNS_KEPT = 400;

function labelOf(speaker: Speaker, start: CallRecordStart): string {
  if (speaker === 'person') {
    return `${start.person}: `;
  }
  return speaker === 'assistant' ? `${start.author}: ` : '· ';
}

export class CallRecord {
  readonly messageId: string;
  private turns: CallTurn[] = [];

  constructor(
    private readonly store: Store,
    private readonly start: CallRecordStart,
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
    this.turns = [...this.turns, { ...turn, text: turn.text.slice(0, TURN_TEXT_MAX) }].slice(
      -TURNS_KEPT,
    );
    this.save();
  }

  transcript(): string {
    return this.lines();
  }

  close(): void {
    this.save();
    this.store.aiChats.touched(this.start.chatId, 0);
  }

  private save(): void {
    const embed: CallTranscript = { kind: 'call_transcript', turns: this.turns };
    this.store.assistantChat.updateMessage(this.messageId, {
      text: this.lines(),
      embeds: [embed],
    });
  }

  private lines(): string {
    const lines = this.turns.map((turn) => `${labelOf(turn.who, this.start)}${turn.text}`);
    let text = lines.join('\n');
    while (text.length > ASSISTANT_TEXT_MAX && lines.length > 0) {
      lines.shift();
      text = lines.join('\n');
    }
    return text;
  }
}
