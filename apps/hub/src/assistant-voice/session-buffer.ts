import type { LiveSession } from './gemini';

type Send = (session: LiveSession) => void;

export class SessionBuffer implements LiveSession {
  private readonly sends: Send[] = [];
  private readonly heard: Send[] = [];

  readonly audio = (pcm: Int16Array): void => {
    this.spoken((session) => {
      session.audio(pcm);
    });
  };

  readonly speaking = (speaking: boolean): void => {
    this.spoken((session) => {
      session.speaking(speaking);
    });
  };

  readonly text = (text: string, respond: boolean): void => {
    this.sends.push((session) => {
      session.text(text, respond);
    });
  };

  readonly picture = (...picture: Parameters<LiveSession['picture']>): void => {
    this.sends.push((session) => {
      session.picture(...picture);
    });
  };

  readonly toolResult = (...result: Parameters<LiveSession['toolResult']>): void => {
    this.sends.push((session) => {
      session.toolResult(...result);
    });
  };

  readonly video = (): void => undefined;

  readonly close = (): void => undefined;

  replay(from: SessionBuffer): void {
    for (const send of from.heard) {
      this.spoken(send);
    }
  }

  private spoken(send: Send): void {
    this.heard.push(send);
    this.sends.push(send);
  }

  drain(into: LiveSession): void {
    for (const send of this.sends.splice(0)) {
      send(into);
    }
  }
}
