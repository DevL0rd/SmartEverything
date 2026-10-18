import type { LiveClientMessageInput } from '@smarteverything/domain';

type Send = (message: LiveClientMessageInput) => void;

export class LiveVoiceWatch {
  private send: Send | null = null;
  private wanted: string | null = null;
  private sent: string | null = null;

  watch(callId: string | null): void {
    this.wanted = callId;
    this.flush();
  }

  refresh(callId: string): void {
    if (this.wanted === callId && this.send !== null) {
      this.send({ type: 'voice_levels_watch', call_id: callId });
      this.sent = callId;
    }
  }

  attach(send: Send): void {
    this.send = send;
    this.sent = null;
    this.flush();
  }

  detach(): void {
    this.send = null;
    this.sent = null;
  }

  private flush(): void {
    if (this.send === null || this.wanted === this.sent) {
      return;
    }
    this.send({ type: 'voice_levels_watch', call_id: this.wanted });
    this.sent = this.wanted;
  }
}

export const liveVoiceWatch = new LiveVoiceWatch();
