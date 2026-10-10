import { ValueStore, useValue } from '../../../design/external-store';

const NOTE_MS = 2600;

const note = new ValueStore<string | null>(null);

let timer: ReturnType<typeof setTimeout> | null = null;

export function noteApplied(text: string): void {
  if (timer !== null) {
    clearTimeout(timer);
  }
  note.set(text);
  timer = setTimeout(() => {
    note.set(null);
    timer = null;
  }, NOTE_MS);
}

export function useAppliedNote(): string | null {
  return useValue(note);
}
