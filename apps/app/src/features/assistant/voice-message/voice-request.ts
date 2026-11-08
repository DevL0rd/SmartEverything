import { ValueStore } from '../../../design/external-store';

const onScreen = new ValueStore<string | null>(null);

const requested = new ValueStore<string | null>(null);

function dropUnless(chatId: string | null): void {
  if (requested.get() !== chatId) {
    requested.set(null);
  }
}

export function showChatOnScreen(chatId: string): () => void {
  dropUnless(chatId);
  onScreen.set(chatId);
  return (): void => {
    if (onScreen.get() === chatId) {
      onScreen.set(null);
      dropUnless(null);
    }
  };
}

export function chatOnScreen(): string | null {
  return onScreen.get();
}

export function requestVoiceMessage(chatId: string): void {
  requested.set(chatId);
}

export function claimVoiceMessage(chatId: string): boolean {
  if (requested.get() !== chatId) {
    return false;
  }
  requested.set(null);
  return true;
}

export function watchVoiceRequests(listener: () => void): () => void {
  return requested.subscribe(listener);
}
