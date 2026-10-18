import type { ListeningSource } from '@smarteverything/domain';

export function pauseNote(source: ListeningSource): string | null {
  if (source.writing.state !== 'paused') return null;
  switch (source.writing.reason) {
    case 'no_openrouter_key':
      return 'Writing down paused · no transcription key';
    case 'cap_reached':
      return 'Writing down paused · daily limit reached';
    case 'privacy':
    case 'offline':
    case 'in_call':
      return null;
  }
}
