import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ffmpegShippedName, stageFfmpeg } from '../ffmpeg-binary.ts';

const INSTALLER = `
const { writeFileSync } = require('node:fs');
const name = process.env.npm_config_platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
const target = process.env.npm_config_platform + '-' + process.env.npm_config_arch;
if (process.env.npm_config_platform === 'linux') {
  const binary = Buffer.alloc(20);
  binary.writeUInt32BE(0x7f454c46, 0);
  binary[5] = 1;
  binary.writeUInt16LE(process.env.npm_config_arch === 'arm64' ? 183 : 62, 18);
  writeFileSync(name, binary);
} else {
  writeFileSync(name, target);
}
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

async function nativeBinary(arch: 'x64' | 'arm64'): Promise<Buffer> {
  const binary = Buffer.alloc(20);
  binary.writeUInt32BE(0x7f454c46, 0);
  binary[5] = 1;
  binary.writeUInt16LE(arch === 'arm64' ? 183 : 62, 18);
  await writeFile(path.join(directory, 'ffmpeg'), binary);
  return binary;
}

beforeEach(async () => {
  service = await mkdtemp(path.join(tmpdir(), 'hub-ffmpeg-'));
});

afterEach(async () => {
  await rm(service, { recursive: true, force: true });
});

describe('stageFfmpeg', () => {
  it.each(['x64', 'arm64'] as const)(
    'keeps the pinned Linux %s binary and notices without running its failing installer',
    async (arch) => {
      await packageWith(FAILING_INSTALLER);
      const binary = await nativeBinary(arch);
      await writeFile(path.join(directory, 'ffmpeg.README'), 'pinned readme');
      await stageFfmpeg(service, 'linux', arch);
      expect(await readFile(path.join(directory, 'ffmpeg'))).toEqual(binary);
      expect(await readFile(path.join(directory, 'ffmpeg.LICENSE'), 'utf8')).toBe('host licence');
      expect(await readFile(path.join(directory, 'ffmpeg.README'), 'utf8')).toBe('pinned readme');
    },
  );

  it('replaces the host binary with the one for the packaging target', async () => {
    await packageWith(INSTALLER);
    await stageFfmpeg(service, 'win32', 'arm64');
    expect(await readFile(path.join(directory, 'ffmpeg.exe'), 'utf8')).toBe('win32-arm64');
    await expect(readFile(path.join(directory, 'ffmpeg'))).rejects.toThrow('ENOENT');
    await expect(readFile(path.join(directory, 'ffmpeg.LICENSE'))).rejects.toThrow('ENOENT');
  });

  it('stages the same platform with a different architecture instead of keeping the host one', async () => {
    await packageWith(INSTALLER);
    await nativeBinary('x64');
    await stageFfmpeg(service, 'linux', 'arm64');
    const binary = await readFile(path.join(directory, 'ffmpeg'));
    expect(binary.readUInt16LE(18)).toBe(183);
    await expect(readFile(path.join(directory, 'ffmpeg.LICENSE'))).rejects.toThrow('ENOENT');
  });

  it('fails when an invalid existing Linux binary cannot be replaced', async () => {
    await packageWith(FAILING_INSTALLER);
    await expect(stageFfmpeg(service, 'linux', 'x64')).rejects.toThrow(
      'Could not stage the ffmpeg binary for linux-x64',
    );
  });

  it('fails when the Linux binary is missing and its installer fails', async () => {
    await packageWith(FAILING_INSTALLER);
    await rm(path.join(directory, 'ffmpeg'));
    await expect(stageFfmpeg(service, 'linux', 'x64')).rejects.toThrow(
      'Could not stage the ffmpeg binary for linux-x64',
    );
  });

  it('rejects an installer that succeeds without producing the requested Linux architecture', async () => {
    await packageWith("require('node:fs').writeFileSync('ffmpeg', 'invalid binary');");
    await expect(stageFfmpeg(service, 'linux', 'arm64')).rejects.toThrow(
      'Could not stage the ffmpeg binary for linux-arm64',
    );
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
