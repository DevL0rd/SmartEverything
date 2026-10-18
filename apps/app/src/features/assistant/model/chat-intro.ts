import type { ChatSource } from './chat-source';

export function introLineOf(source: ChatSource, parentTitle: string | null, when: string): string {
  switch (source.kind) {
    case 'app':
      return `Started in the app · ${when}`;
    case 'plugin':
      return `Started from ${source.label} · ${when}`;
    case 'camera':
      return `Started by the wake word on ${source.label} · ${when}`;
    case 'call':
      return `Started by a voice call · ${when}`;
    case 'schedule':
      return `Started by a schedule · ${when}`;
    case 'branch':
      return parentTitle === null
        ? `${source.label} · ${when}`
        : `${source.label} of ${parentTitle} · ${when}`;
  }
}

const MORNING = 5;
const AFTERNOON = 12;
const EVENING = 17;
const NIGHT = 22;

export function greetingOf(hour: number): string {
  if (hour < MORNING || hour >= NIGHT) return 'Good night';
  if (hour < AFTERNOON) return 'Good morning';
  return hour < EVENING ? 'Good afternoon' : 'Good evening';
}

export function draftGreeting(hour: number, profileName: string | null): string {
  const first = profileName?.trim().split(/\s+/u)[0];
  return first === undefined || first === '' ? greetingOf(hour) : `${greetingOf(hour)}, ${first}`;
}
