import { createServer } from 'node:http';
import { PassThrough } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Logger } from '@smarteverything/logging';
import { ServerObserver } from '../../src/server/http-observe';
import { captureLogs, type CapturedLogs } from '../support/logs';

let logs: CapturedLogs;

beforeEach(() => {
  logs = captureLogs();
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
});

afterEach(() => {
  vi.useRealTimers();
  Logger.reset();
});

function summaries(): number {
  return logs.events().filter((event) => event === 'http.summary').length;
}

describe('http summary of an idle listener', () => {
  it('keeps no timer while nothing happens and reports one window after activity', async () => {
    const server = createServer();
    const observer = new ServerObserver('api');
    observer.summarise(server);
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(300_000);
    expect(summaries()).toBe(0);
    observer.connected(new PassThrough());
    observer.connected(new PassThrough());
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(summaries()).toBe(1);
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(300_000);
    expect(summaries()).toBe(1);
    observer.connected(new PassThrough());
    server.emit('close');
    expect(vi.getTimerCount()).toBe(0);
  });
});
