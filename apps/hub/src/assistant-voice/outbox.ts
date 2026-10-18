import { appendTo } from '@smarteverything/domain';
const TRACKED_TASKS = 200;

export function combined(notes: readonly string[]): string {
  const joined = notes.join('\n\n');
  return notes.length > 1
    ? `${joined}\n\n[Several updates arrived together: tell them as one short message that keeps every important detail.]`
    : joined;
}

export class Outbox {
  private readonly owners = new Map<string, string>();
  private readonly untold = new Map<string, string[]>();

  track(eventId: string, profileId: string): void {
    this.owners.set(eventId, profileId);
    if (this.owners.size > TRACKED_TASKS) {
      const [oldest] = this.owners.keys();
      if (oldest !== undefined) {
        this.owners.delete(oldest);
      }
    }
  }

  ownerOf(eventId: string): string | null {
    return this.owners.get(eventId) ?? null;
  }

  add(profileId: string, note: string): void {
    appendTo(this.untold, profileId, note);
  }

  take(profileId: string): string[] {
    const notes = this.untold.get(profileId) ?? [];
    this.untold.delete(profileId);
    return notes;
  }
}
