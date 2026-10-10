import type { AssistantVoiceServerMessage } from '@smarteverything/domain';

export class SaidTurns {
  private pending = '';

  constructor(private readonly said: (text: string) => void) {}

  message(message: AssistantVoiceServerMessage): void {
    switch (message.type) {
      case 'caption':
        if (message.who === 'assistant') {
          this.caption(message.text);
        }
        return;
      case 'call_state':
        if (message.state === 'listening') {
          this.flush();
        }
        return;
      case 'interrupted':
      case 'ended':
        this.flush();
        return;
      case 'ready':
        return;
    }
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
