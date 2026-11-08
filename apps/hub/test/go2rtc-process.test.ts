import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { GO2RTC_USERNAME, startGo2rtc } from '../src/cameras/go2rtc-process';
import { ffmpegPath } from '../src/media/ffmpeg-path';
import { captureLogs, testLogger, type CapturedLogs } from './support/logs';

let directory = '';
let logs: CapturedLogs;

beforeEach(async () => {
  logs = captureLogs();
  directory = await mkdtemp(join(tmpdir(), 'hub-go2rtc-'));
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

async function fakeBinary(body: string): Promise<string> {
  const path = join(directory, 'go2rtc-binary');
  await writeFile(
    path,
    ['#!/bin/sh', 'printf "%s\\n" "$@" > "$(dirname "$2")/arguments"', body].join('\n'),
  );
  await chmod(path, 0o700);
  return path;
}

const DEATH_CHECK_DELAY_MS = 1200;

const READY = [
  "echo 'plain text line'",
  "echo '{broken'",
  `echo '{"level":"warn","message":"[webrtc] no candidates"}'`,
  `echo '{"level":"error","message":"[rtsp] cannot connect"}'`,
  `echo '{"level":"warn","error":"streams: read udp [::]:59885: i/o timeout","caller":"webrtc.go:281"}'`,
  `echo '{"level":"error","error":"streams: read udp [::]:53922: i/o timeout","caller":"server.go:129"}'`,
  `echo '{"level":"error","error":"streams: Get \\"https://sts.example/sts?auth=secret&nonce=n\\": timeout"}'`,
  `echo '{"level":"warn","message":"dial xiaomi://1:sg@10.0.0.2?client_private=k&sign=s failed"}'`,
  `echo '{"level":"debug","message":"[streams] probing"}'`,
  `echo '{"other":true}'`,
  `echo '{"level":"info","caller":"silent.go:1"}'`,
  "echo 'complaint' >&2",
  `echo '{"level":"info","message":"[api] listen","addr":"127.0.0.1:1984"}'`,
].join('\n');

function launch(
  binary: string,
  exited: (cause: Error) => void = () => undefined,
): Parameters<typeof startGo2rtc>[0] {
  return {
    binary,
    configPath: join(directory, 'go2rtc', 'go2rtc.yaml'),
    apiPort: 1984,
    rtspPort: 8554,
    webrtcPort: 8555,
    candidates: [],
    iceServers: [],
    password: 'fixed-password',
    xiaomi: { '1234567': 'pass-token' },
    log: testLogger(),
    exited,
  };
}

describe('startGo2rtc', () => {
  it('writes a private config, starts go2rtc with it, relays its log and resolves once the API listens', async () => {
    const running = await startGo2rtc(launch(await fakeBinary(`${READY}\nexec sleep 30`)));
    const configPath = join(directory, 'go2rtc', 'go2rtc.yaml');
    expect(await readFile(join(directory, 'go2rtc', 'arguments'), 'utf8')).toBe(
      `-config\n${configPath}\n`,
    );
    expect(parse(await readFile(configPath, 'utf8'))).toMatchObject({
      api: { username: GO2RTC_USERNAME, password: running.password },
      ffmpeg: { bin: ffmpegPath() },
      xiaomi: { '1234567': 'pass-token' },
    });
    expect(running.password).toBe('fixed-password');
    expect(running.baseUrl).toBe('http://127.0.0.1:1984');
    expect(running.username).toBe(GO2RTC_USERNAME);
    await running.stop();
    await running.stop();
    expect(logs.events()).toEqual(
      expect.arrayContaining([
        'go2rtc.output',
        'go2rtc.reported',
        'go2rtc.stderr',
        'go2rtc.started',
      ]),
    );
    const reported = logs.records.filter((record) => record.event === 'go2rtc.reported');
    expect(reported.map((record) => record.level)).toStrictEqual([
      'warn',
      'error',
      'warn',
      'error',
      'error',
      'warn',
      'debug',
      'debug',
    ]);
    expect(reported.map((record) => record.payload)).toStrictEqual([
      { message: '[webrtc] no candidates' },
      { level: 'error', message: '[rtsp] cannot connect' },
      { error: 'streams: read udp [::]:59885: i/o timeout', caller: 'webrtc.go:281' },
      {
        level: 'error',
        error: 'streams: read udp [::]:53922: i/o timeout',
        caller: 'server.go:129',
      },
      { level: 'error', error: 'streams: Get "https://sts.example/sts?[redacted]": timeout' },
      { message: 'dial xiaomi://1:sg@10.0.0.2?[redacted] failed' },
      { level: 'debug', message: '[streams] probing' },
      { level: 'info', message: '[api] listen' },
    ]);
    expect(
      logs.records.filter((record) => record.event === 'go2rtc.output').map((r) => r.payload),
    ).toStrictEqual([
      { text: 'plain text line' },
      { text: '{broken' },
      { text: '{"other":true}' },
      { text: '{"level":"info","caller":"silent.go:1"}' },
    ]);
  });

  it('fails visibly when go2rtc exits before it is ready', async () => {
    await expect(startGo2rtc(launch(await fakeBinary('exit 3')))).rejects.toThrow(
      'go2rtc exited unexpectedly with code 3 and signal null.',
    );
  });

  it('reports an exit that nobody asked for', async () => {
    const pidFile = join(directory, 'pid');
    const binary = await fakeBinary(
      [
        `echo $$ > "${pidFile}"`,
        `trap 'kill $child; exit 4' USR1`,
        READY,
        'sleep 30 &',
        'child=$!',
        'wait $child',
      ].join('\n'),
    );
    let report: (cause: Error) => void = () => undefined;
    const exited = new Promise<Error>((resolve) => {
      report = resolve;
    });
    const running = await startGo2rtc(
      launch(binary, (cause) => {
        report(cause);
      }),
    );
    expect(running.baseUrl).toBe('http://127.0.0.1:1984');
    process.kill(Number(await readFile(pidFile, 'utf8')), 'SIGUSR1');
    expect((await exited).message).toBe('go2rtc exited unexpectedly with code 4 and signal null.');
  });

  it('logs a death and reports it when go2rtc exits while nobody is stopping it', async () => {
    const pidFile = join(directory, 'dying-pid');
    const binary = await fakeBinary(
      [
        `echo $$ > "${pidFile}"`,
        `trap 'kill $child; exit 7' USR1`,
        READY,
        'sleep 30 &',
        'child=$!',
        'wait $child',
      ].join('\n'),
    );
    let report: (cause: Error) => void = () => undefined;
    const exited = new Promise<Error>((resolve) => {
      report = resolve;
    });
    await startGo2rtc(
      launch(binary, (cause) => {
        report(cause);
      }),
    );
    process.kill(Number(await readFile(pidFile, 'utf8')), 'SIGUSR1');
    const cause = await exited;
    expect(cause.name).toBe('Go2rtcExitedError');
    expect(cause.message).toBe('go2rtc exited unexpectedly with code 7 and signal null.');
    const deaths = logs.records.filter((record) => record.event === 'go2rtc.died');
    expect(deaths.map((record) => record.level)).toStrictEqual(['error']);
    expect(deaths.map((record) => record.failure?.name)).toStrictEqual(['Go2rtcExitedError']);
  });

  it('treats an exit as expected after expectStop and never reports a death', async () => {
    const pidFile = join(directory, 'expected-pid');
    const binary = await fakeBinary([`echo $$ > "${pidFile}"`, READY, 'exec sleep 30'].join('\n'));
    let reports = 0;
    const running = await startGo2rtc(
      launch(binary, () => {
        reports += 1;
      }),
    );
    running.expectStop();
    expect(logs.records.filter((record) => record.event === 'go2rtc.stopping')).toHaveLength(1);
    process.kill(Number(await readFile(pidFile, 'utf8')), 'SIGTERM');
    await new Promise((resolve) => setTimeout(resolve, DEATH_CHECK_DELAY_MS));
    await running.stop();
    expect(reports).toBe(0);
    expect(logs.events()).not.toContain('go2rtc.died');
    expect(
      logs.records
        .filter((record) => record.event === 'go2rtc.exited')
        .map((record) => record.payload['expected']),
    ).toStrictEqual([true]);
    expect(logs.records.filter((record) => record.event === 'go2rtc.stopping')).toHaveLength(1);
  });

  it('fails visibly when the binary cannot be started', async () => {
    await expect(startGo2rtc(launch(join(directory, 'missing')))).rejects.toThrow(/ENOENT/);
  });
});
