import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Thumbnails } from '../../src/cameras/thumbnails';
import { FfmpegUnavailableError, ffmpegPath } from '../../src/media/ffmpeg-path';
import { CameraMicrophones } from '../../src/talk/camera-microphone';
import { testLogger } from '../support/logs';

const run = promisify(execFile);
const CLOSED_PORT = 1;

let directory = '';

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'hub-ffmpeg-'));
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(directory, { recursive: true, force: true });
});

function withoutSystemPath(): void {
  vi.stubEnv('PATH', '');
}

describe('bundled ffmpeg', () => {
  it('resolves an absolute path to a binary that runs with nothing on PATH', async () => {
    withoutSystemPath();
    const path = ffmpegPath();
    expect(isAbsolute(path)).toBe(true);
    const { stdout } = await run(path, ['-version'], { env: { PATH: '' } });
    expect(stdout).toMatch(/^ffmpeg version /u);
  });

  it('makes a camera thumbnail with nothing on PATH', async () => {
    const source = join(directory, 'frame.jpg');
    await run(ffmpegPath(), [
      '-v',
      'error',
      '-f',
      'lavfi',
      '-i',
      'testsrc=size=640x480',
      '-frames:v',
      '1',
      source,
    ]);
    withoutSystemPath();
    const thumbnail = await new Thumbnails().of(source);
    expect((await stat(thumbnail)).size).toBeGreaterThan(0);
  });

  it('opens a camera microphone with nothing on PATH and reports ffmpeg’s own failure, not a missing program', async () => {
    withoutSystemPath();
    const ended = new Promise<string | null>((resolve) => {
      void new CameraMicrophones({
        rtspPort: CLOSED_PORT,
        ready: (): Promise<void> => Promise.resolve(),
        log: testLogger('talk'),
      }).open('camera', { packet: (): void => undefined, ended: resolve });
    });
    const failure = await ended;
    expect(failure).toMatch(/^ffmpeg stopped \(\d+\)/u);
    expect(failure).not.toContain('ENOENT');
  });

  it('names the platform and architecture when no ffmpeg exists for them', () => {
    const require = createRequire(import.meta.url);
    const module = require.resolve('ffmpeg-static');
    const cached = require.cache[module];
    Reflect.deleteProperty(require.cache, module);
    vi.stubEnv('npm_config_platform', 'plan9');
    try {
      expect(() => ffmpegPath()).toThrow(FfmpegUnavailableError);
      expect(() => ffmpegPath()).toThrow(`${process.platform}-${process.arch}`);
    } finally {
      Reflect.deleteProperty(require.cache, module);
      if (cached !== undefined) require.cache[module] = cached;
    }
  });
});
