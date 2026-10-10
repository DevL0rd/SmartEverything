import type { AiSpeechNotice } from '@smarteverything/domain';

type Listener = (notice: AiSpeechNotice) => void;

const listeners = new Set<Listener>();

export function onAiSpeech(listener: Listener): () => void {
  listeners.add(listener);
  return (): void => {
    listeners.delete(listener);
  };
}

export function deliverAiSpeech(notice: AiSpeechNotice): number {
  for (const listener of listeners) {
    listener(notice);
  }
  return listeners.size;
}
