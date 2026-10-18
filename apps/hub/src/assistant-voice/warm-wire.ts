import type { UsageMetadata } from '@google/genai';
import type { LiveEvents, LiveSession } from './gemini';

export class WarmTenant {
  private events: LiveEvents | null = null;
  private begun = false;

  constructor(readonly callId: string) {}

  get sink(): LiveEvents | null {
    return this.events;
  }

  get started(): boolean {
    return this.begun;
  }

  attach(events: LiveEvents): void {
    this.events = events;
  }

  start(): void {
    this.begun = true;
  }
}

export interface WireRoute {
  readonly current: () => boolean;
  readonly sink: () => LiveEvents | null;
  readonly idleOutput: (kind: string) => void;
  readonly idleTool: (callId: string, name: string) => void;
  readonly resumable: (handle: string | null) => void;
  readonly goAway: (timeLeft: string | null) => void;
  readonly usage: (usage: UsageMetadata) => void;
  readonly closed: (reason: string, code: number) => void;
}

type Forward<A extends unknown[]> = (sink: LiveEvents, ...args: A) => void;

function outputOf(route: WireRoute) {
  return <A extends unknown[]>(kind: string, forward: Forward<A>) =>
    (...args: A): void => {
      if (!route.current()) {
        return;
      }
      const sink = route.sink();
      if (sink === null) {
        route.idleOutput(kind);
      } else {
        forward(sink, ...args);
      }
    };
}

export function routedEvents(route: WireRoute): LiveEvents {
  const output = outputOf(route);
  const whileCurrent =
    <A extends unknown[]>(handle: (...args: A) => void) =>
    (...args: A): void => {
      if (route.current()) {
        handle(...args);
      }
    };
  return {
    audio: output('audio', (sink, pcm: Int16Array) => {
      sink.audio(pcm);
    }),
    said: output('said', (sink, text: string) => {
      sink.said(text);
    }),
    heard: output('heard', (sink, text: string) => {
      sink.heard(text);
    }),
    interrupted: output('interrupted', (sink) => {
      sink.interrupted();
    }),
    turnComplete: output('turn_complete', (sink) => {
      sink.turnComplete();
    }),
    tool: whileCurrent((callId: string, name: string, args: Readonly<Record<string, unknown>>) => {
      const sink = route.sink();
      if (sink === null) {
        route.idleTool(callId, name);
      } else {
        sink.tool(callId, name, args);
      }
    }),
    resumable: whileCurrent(route.resumable),
    goAway: whileCurrent(route.goAway),
    usage: route.usage,
    closed: route.closed,
  };
}

export function leasedSession(
  session: LiveSession,
  leased: () => boolean,
  close: () => void,
): LiveSession {
  const only =
    <A extends unknown[]>(send: (...args: A) => void) =>
    (...args: A): void => {
      if (leased()) {
        send(...args);
      }
    };
  return {
    audio: only(session.audio),
    speaking: only(session.speaking),
    text: only(session.text),
    picture: only(session.picture),
    toolResult: only(session.toolResult),
    video: only(session.video),
    close: only(close),
  };
}

export function answers(session: LiveSession, withinMs: number): Promise<boolean> {
  return session.alive === undefined ? Promise.resolve(false) : session.alive(withinMs);
}
