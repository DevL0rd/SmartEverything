import type { LogPayload, Logger } from '@smarteverything/logging';

export interface UnitNote {
  readonly level: 'info' | 'warn';
  readonly event: string;
  readonly fields: LogPayload | undefined;
}

export type NoteLogger = Pick<Logger, 'info' | 'warn'>;

export class NoteLog implements NoteLogger {
  readonly notes: UnitNote[] = [];

  info(event: string, payload?: LogPayload): void {
    this.notes.push({ level: 'info', event, fields: payload });
  }

  warn(event: string, payload?: LogPayload): void {
    this.notes.push({ level: 'warn', event, fields: payload });
  }
}

export function replayNotes(log: NoteLogger, notes: readonly UnitNote[]): void {
  for (const note of notes) {
    if (note.level === 'warn') {
      log.warn(note.event, note.fields);
    } else {
      log.info(note.event, note.fields);
    }
  }
}
