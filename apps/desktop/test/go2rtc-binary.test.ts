import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  GO2RTC_LICENSE_FILE,
  Go2rtcTargetError,
  go2rtcBuildName,
  stageGo2rtc,
} from '../src/service/go2rtc-binary.js';

const EXECUTABLE_BITS = 0o111;

let root = '';
let builds = '';
let stage = '';

async function build(file: string, text: string): Promise<void> {
  await writeFile(path.join(builds, file), text);
}

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'desktop-go2rtc-'));
  builds = path.join(root, 'out');
  stage = path.join(root, 'stage', 'go2rtc');
  await mkdir(builds, { recursive: true });
  await build('go2rtc-linux-amd64', 'linux amd64');
  await build('go2rtc-linux-arm64', 'linux arm64');
  await build('go2rtc-windows-amd64.exe', 'windows amd64');
  await build(GO2RTC_LICENSE_FILE, 'licence');
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('go2rtcBuildName', () => {
  it('names the build for each shipped platform and architecture', () => {
    expect(go2rtcBuildName('linux', 'arm64')).toBe('go2rtc-linux-arm64');
    expect(go2rtcBuildName('linux', 'x64')).toBe('go2rtc-linux-amd64');
    expect(go2rtcBuildName('win32', 'x64')).toBe('go2rtc-windows-amd64.exe');
  });

  it('refuses a platform go2rtc is not built for', () => {
    expect(() => go2rtcBuildName('win32', 'arm64')).toThrow(Go2rtcTargetError);
  });
});

describe('stageGo2rtc', () => {
  it('stages the arm64 build as an executable named go2rtc beside its licence', async () => {
    await stageGo2rtc(builds, stage, 'linux', 'arm64');
    expect(await readFile(path.join(stage, 'go2rtc'), 'utf8')).toBe('linux arm64');
    expect((await stat(path.join(stage, 'go2rtc'))).mode & EXECUTABLE_BITS).toBe(EXECUTABLE_BITS);
    expect(await readFile(path.join(stage, GO2RTC_LICENSE_FILE), 'utf8')).toBe('licence');
  });

  it('replaces what an earlier staging left behind', async () => {
    await stageGo2rtc(builds, stage, 'win32', 'x64');
    await stageGo2rtc(builds, stage, 'linux', 'x64');
    expect(await readFile(path.join(stage, 'go2rtc'), 'utf8')).toBe('linux amd64');
    await expect(readFile(path.join(stage, 'go2rtc.exe'))).rejects.toThrow('ENOENT');
  });

  it('fails loudly when the target has no build in the folder', async () => {
    await rm(path.join(builds, 'go2rtc-linux-arm64'));
    await expect(stageGo2rtc(builds, stage, 'linux', 'arm64')).rejects.toThrow('ENOENT');
  });

  it('refuses an unsupported target before touching the stage', async () => {
    await mkdir(stage, { recursive: true });
    await writeFile(path.join(stage, 'go2rtc'), 'earlier');
    await expect(stageGo2rtc(builds, stage, 'freebsd', 'x64')).rejects.toThrow(Go2rtcTargetError);
    expect(await readFile(path.join(stage, 'go2rtc'), 'utf8')).toBe('earlier');
  });
});
