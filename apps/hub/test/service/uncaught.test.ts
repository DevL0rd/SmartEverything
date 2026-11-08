import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';
import { stopOnUncaught } from '../../src/service/uncaught';
import { captureLogs, testLogger } from '../support/logs';

describe('an exception nothing caught', () => {
  it('is logged with its stack and stops the hub with a failure code', async () => {
    const logs = captureLogs();
    const source = new EventEmitter();
    const stopped: number[] = [];
    stopOnUncaught(source, testLogger('service'), (code) => {
      stopped.push(code);
      return Promise.resolve();
    });
    source.emit('uncaughtException', new Error('WebSocket is not open: readyState 0 (CONNECTING)'));
    await Promise.resolve();
    expect(stopped).toEqual([1]);
    const record = logs.records.find((entry) => entry.event === 'process.uncaught');
    expect(record?.level).toBe('exception');
    expect(JSON.stringify(record)).toContain('readyState 0');
  });

  it('stops listening once the hub has stopped', () => {
    const source = new EventEmitter();
    const detach = stopOnUncaught(source, testLogger('service'), () => Promise.resolve());
    expect(source.listenerCount('uncaughtException')).toBe(1);
    detach();
    expect(source.listenerCount('uncaughtException')).toBe(0);
  });
});
