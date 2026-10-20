import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { startGo2rtc, type RunningGo2rtc } from '../src/cameras/go2rtc-process';
import { captureLogs, testLogger } from './support/logs';

let directory = '';

beforeEach(async () => {
  captureLogs();
  directory = await mkdtemp(join(tmpdir(), 'hub-go2rtc-signals-'));
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

async function start(): Promise<RunningGo2rtc> {
  const binary = join(directory, 'go2rtc-binary');
  await writeFile(
    binary,
    [
      '#!/bin/sh',
      `echo '{"level":"info","message":"[api] listen","addr":"127.0.0.1:1984"}'`,
      'exec sleep 30',
    ].join('\n'),
  );
  await chmod(binary, 0o700);
  return startGo2rtc({
    binary,
    dataDirectory: directory,
    apiPort: 1984,
    rtspPort: 8554,
    webrtcPort: 8555,
    candidates: [],
    iceServers: [],
    password: 'fixed-password',
    xiaomi: {},
    log: testLogger(),
    exited: () => undefined,
  });
}

describe('startGo2rtc process listeners', () => {
  it('adds no SIGTERM or SIGINT listener however often go2rtc is started', async () => {
    const before = [process.listenerCount('SIGTERM'), process.listenerCount('SIGINT')];
    const first = await start();
    const second = await start();
    expect([process.listenerCount('SIGTERM'), process.listenerCount('SIGINT')]).toStrictEqual(
      before,
    );
    await first.stop();
    await second.stop();
  });
});
