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
