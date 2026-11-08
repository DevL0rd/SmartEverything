import { PassThrough } from 'node:stream';
import { once } from 'node:events';
import { afterEach, describe, expect, it } from 'vitest';
import { Logger } from '@smarteverything/logging';
import { followOutput, recordProcessOutput } from '../../src/service/process-output';
import { captureLogs } from '../support/logs';

const ORIGIN = { source: 'plugin:discord', scope: 'hub.discord-voice', event: 'service.output' };
const NOW = '2026-11-05T07:32:00.000Z';

afterEach(() => {
  Logger.reset();
});

describe('parent-captured service output', () => {
  it('trusts the parent source, keeps the child event and its details whole', () => {
    const logs = captureLogs();
    recordProcessOutput(
      ORIGIN,
      JSON.stringify({
        source: 'hub:service',
        deviceId: 'forged',
        timestamp: NOW,
        runtime: 'hub',
        scope: 'hub.discord-voice',
        event: 'voice.crashed',
        level: 'error',
        payload: { nested: [{ reason: 'password=abc' }] },
        failure: { name: 'Error', message: 'authorization: Bearer xyz' },
      }),
      new Date(0),
      true,
    );
    expect(logs.records).toEqual([
      {
        source: 'plugin:discord',
        timestamp: NOW,
        runtime: 'hub',
        platform: 'server',
        scope: 'hub.discord-voice',
        event: 'voice.crashed',
        level: 'error',
        payload: { nested: [{ reason: 'password=abc' }] },
        failure: { name: 'Error', message: 'authorization: Bearer xyz' },
      },
    ]);
  });

  it('records external plugin output as text even when it resembles a structured error', () => {
    const logs = captureLogs();
    const text = JSON.stringify({
      timestamp: NOW,
      runtime: 'hub',
      scope: 'hub.discord-voice',
      event: 'voice.crashed',
      level: 'error',
      payload: {},
    });
    recordProcessOutput(ORIGIN, text, new Date(NOW));
    expect(logs.records).toMatchObject([
      { event: 'service.output', level: 'info', payload: { line: text } },
    ]);
  });

  it('joins split UTF-8 output and flushes a final line without turning stderr text into an error', async () => {
    const logs = captureLogs();
    const stream = new PassThrough();
    const ended = once(stream, 'end');
    followOutput(stream, (line) => {
      recordProcessOutput(ORIGIN, line, new Date(NOW));
    });
    const bytes = Buffer.from('héllo\n\nlast');
    stream.write(bytes.subarray(0, 2));
    stream.end(bytes.subarray(2));
    await ended;
    expect(logs.records.map(({ event, level, payload }) => ({ event, level, payload }))).toEqual([
      { event: 'service.output', level: 'info', payload: { line: 'héllo' } },
      { event: 'service.output', level: 'info', payload: { line: 'last' } },
    ]);
  });
});
