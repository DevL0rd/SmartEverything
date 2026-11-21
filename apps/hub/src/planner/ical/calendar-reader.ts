import type { Logger } from '@smarteverything/logging';
import { CodecThread, CodecWorkerError } from '../../codec/thread';
import { IcalParseError, type IcalCalendar } from './model';
import type { ReadOptions } from './read';

export interface CalendarReader {
  readonly read: (text: string, options: ReadOptions) => Promise<IcalCalendar>;
}

export class CalendarWorker implements CalendarReader {
  private readonly thread: CodecThread;

  constructor(script: string, log: Logger) {
    this.thread = new CodecThread(script, 'calendar', log.forArea('hub.planner'));
  }

  read(text: string, options: ReadOptions): Promise<IcalCalendar>;
  async read(text: string, options: ReadOptions): Promise<unknown> {
    const reply = await this.thread.run({
      kind: 'calendar',
      text,
      defaultZone: options.defaultZone,
    });
    if (reply.kind === 'calendar') return reply.calendar;
    if (reply.kind === 'calendar_unreadable') throw new IcalParseError(reply.reason);
    throw new CodecWorkerError(`The calendar worker answered ${reply.kind} to a calendar.`);
  }

  close(): Promise<void> {
    return this.thread.close();
  }
}
