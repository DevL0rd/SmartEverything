import type { LiveEvents, LiveOptions, LiveSession, VoiceProvider } from './gemini';

export interface VoiceLine {
  readonly live: (options: LiveOptions, events: LiveEvents) => Promise<LiveSession>;
  readonly known: () => ReadonlySet<string> | null;
  readonly release: (session: LiveSession | null, lines: readonly string[]) => void;
}

export function plainLine(provider: VoiceProvider): VoiceLine {
  return {
    live: (options, events) => provider.live(options, events),
    known: () => null,
    release: (session): void => {
      session?.close();
    },
  };
}
