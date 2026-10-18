import { Logger, type LogRecord } from '@smarteverything/logging';
import { afterEach, describe, expect, it } from 'vitest';

describe('lifecycle event names', () => {
  afterEach(() => {
    Logger.reset();
  });

  it('are accepted by the logger for the nouns the screens use', () => {
    const records: LogRecord[] = [];
    Logger.configure({ level: 'trace', sink: (record) => records.push(record) });
    const log = new Logger('app.devices');
    for (const noun of ['device_screen', 'devices_screen', 'events_screen', 'viewer']) {
      log.info(`${noun}.mounted`, { subject: 'a' });
      log.info(`${noun}.unmounted`, { subject: 'a' });
    }
    expect(records).toHaveLength(8);
  });
});
