import { Logger, type LogRecord } from '@smarteverything/logging';

export interface CapturedLogs {
  readonly records: LogRecord[];
  readonly events: () => string[];
}

export function captureLogs(): CapturedLogs {
  const records: LogRecord[] = [];
  Logger.reset();
  Logger.configure({
    level: 'trace',
    sink: (record) => {
      records.push(record);
    },
  });
  return { records, events: () => records.map((record) => record.event) };
}

export function testLogger(area = 'test'): Logger {
  return new Logger(`hub.${area}`);
}
