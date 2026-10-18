export interface VoiceTask {
  readonly profileId: string;
  readonly clientId: string | null;
  readonly device: string;
  readonly task: string;
  readonly said: string | null;
  readonly callMessageId: string | null;
}

interface VoicePlace {
  readonly profileId: string;
  readonly clientId: string | null;
  readonly device: string;
}

export interface VoiceResponder {
  readonly ready: (chatId?: string) => string | null;
  readonly chatForCall: (place: VoicePlace & { readonly chatId: string | null }) => string;
  readonly request: (task: VoiceTask & { readonly chatId: string }) => string;
  readonly callEnded: (chatId: string, transcript: string) => void;
}

export type VoiceResultHandler = (eventId: string, text: string, progress: boolean) => boolean;
