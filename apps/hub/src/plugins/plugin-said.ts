import type { AssistantVoiceServerMessage } from '@smarteverything/domain';

function endsTurn(message: Exclude<AssistantVoiceServerMessage, { type: 'caption' }>): boolean {
  switch (message.type) {
    case 'call_state':
      return message.state === 'listening';
    case 'interrupted':
    case 'ended':
      return true;
    case 'ready':
    case 'capabilities':
    case 'sight_state':
    case 'sight_request':
    case 'sight_capture':
    case 'sight_looked':
      return false;
  }
}

export class SaidTurns {
  private pending = '';

  constructor(private readonly said: (text: string) => void) {}

  message(message: AssistantVoiceServerMessage): void {
    if (message.type === 'caption') {
      if (message.who === 'assistant') this.caption(message.text);
      return;
    }
    if (endsTurn(message)) this.flush();
  }

  private caption(text: string): void {
    if (this.pending !== '' && !text.startsWith(this.pending)) {
      this.flush();
    }
    this.pending = text;
  }

  private flush(): void {
    const text = this.pending.trim();
    this.pending = '';
    if (text !== '') {
      this.said(text);
    }
  }
}
