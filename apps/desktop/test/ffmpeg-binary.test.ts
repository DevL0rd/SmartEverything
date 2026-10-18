import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ffmpegShippedName, stageFfmpeg } from '../src/service/ffmpeg-binary.js';

const INSTALLER = `
const { writeFileSync } = require('node:fs');
const name = process.env.npm_config_platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
writeFileSync(name, process.env.npm_config_platform + '-' + process.env.npm_config_arch);
`;
const FAILING_INSTALLER = 'process.exit(1);';

let service = '';
let directory = '';

async function packageWith(installer: string): Promise<void> {
  directory = path.join(service, 'node_modules', 'ffmpeg-static');
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, 'install.js'), installer);
  await writeFile(path.join(directory, 'ffmpeg'), 'host-linux-x64');
  await writeFile(path.join(directory, 'ffmpeg.LICENSE'), 'host licence');
}

beforeEach(async () => {
  service = await mkdtemp(path.join(tmpdir(), 'desktop-ffmpeg-'));
});

afterEach(async () => {
  await rm(service, { recursive: true, force: true });
});

describe('stageFfmpeg', () => {
  it('replaces the host binary with the one for the packaging target', async () => {
    await packageWith(INSTALLER);
    await stageFfmpeg(service, 'win32', 'arm64');
    expect(await readFile(path.join(directory, 'ffmpeg.exe'), 'utf8')).toBe('win32-arm64');
    await expect(readFile(path.join(directory, 'ffmpeg'))).rejects.toThrow('ENOENT');
    await expect(readFile(path.join(directory, 'ffmpeg.LICENSE'))).rejects.toThrow('ENOENT');
  });

  it('stages the same platform with a different architecture instead of keeping the host one', async () => {
    await packageWith(INSTALLER);
    await stageFfmpeg(service, 'linux', 'arm64');
    expect(await readFile(path.join(directory, 'ffmpeg'), 'utf8')).toBe('linux-arm64');
  });

  it('fails loudly when the target binary cannot be fetched', async () => {
    await packageWith(FAILING_INSTALLER);
    await expect(stageFfmpeg(service, 'darwin', 'arm64')).rejects.toThrow(
      'Could not stage the ffmpeg binary for darwin-arm64',
    );
  });

  it('fails loudly when the service build did not ship ffmpeg-static', async () => {
    await expect(stageFfmpeg(service, 'linux', 'x64')).rejects.toThrow(
      'Could not stage the ffmpeg binary for linux-x64',
    );
  });
});

describe('ffmpegShippedName', () => {
  it('adds the exe suffix only on Windows', () => {
    expect(ffmpegShippedName('win32')).toBe('ffmpeg.exe');
    expect(ffmpegShippedName('darwin')).toBe('ffmpeg');
  });
});
