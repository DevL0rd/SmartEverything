import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { copyServiceAssets, WAKE_MODEL_DIRECTORY } from '../copy-voice-assets.ts';
import { elfMachine, highestGlibc, isWasmModule } from '../native-binary.ts';
import { ServiceRuntimeError } from '../service-runtime.ts';
import {
  OLDEST_SUPPORTED_GLIBC,
  SERVICE_TARGET_NAME,
  serviceTarget,
  ServiceTargetError,
  serviceTargetProblems,
  smokeLoadedPackages,
  verifyServiceTarget,
} from '../service-target.ts';

const X64 = 62;
const ARM64 = 183;
const ELF_BYTES = 64;
const WASM = Buffer.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);
const ARM64_TARGET = serviceTarget('linux-arm64');

let scratch = '';

beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), 'service-target-'));
});

afterEach(() => {
  rmSync(scratch, { recursive: true, force: true });
});

function elf(machine: number, glibc = ''): Buffer {
  const header = Buffer.alloc(ELF_BYTES);
  header.writeUInt32BE(0x7f454c46, 0);
  header[4] = 2;
  header[5] = 1;
  header[6] = 1;
  header.writeUInt16LE(machine, 18);
  return Buffer.concat([header, Buffer.from(glibc)]);
}

function put(file: string, bytes: Buffer | string): string {
  const path = join(scratch, file);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, bytes);
  return path;
}

function bundle(machine = ARM64): void {
  put('node_modules/@snazzah/davey-linux-arm64-gnu/davey.linux-arm64-gnu.node', elf(machine));
  put('node_modules/@anthropic-ai/claude-agent-sdk-linux-arm64/claude', elf(machine));
  put('node_modules/@img/sharp-wasm32/index.cjs', 'module.exports = {};');
  put('node_modules/sherpa-onnx/sherpa-onnx-wasm-nodejs.wasm', WASM);
  for (const file of ['encoder.int8.onnx', 'decoder.int8.onnx', 'joiner.int8.onnx']) {
    put(join(WAKE_MODEL_DIRECTORY, file), 'model');
  }
  put(join(WAKE_MODEL_DIRECTORY, 'tokens.txt'), 'tokens');
  put(join(WAKE_MODEL_DIRECTORY, 'bpe.vocab'), 'vocab');
}

function problems(binaries = false): readonly string[] {
  return serviceTargetProblems(scratch, ARM64_TARGET, { binaries });
}

describe('native binary headers', () => {
  it('reads the machine of a little-endian ELF file', () => {
    expect(elfMachine(put('a', elf(ARM64)))).toBe(ARM64);
    expect(elfMachine(put('b', elf(X64)))).toBe(X64);
  });

  it('refuses a file that is not a little-endian ELF binary', () => {
    const bigEndian = elf(ARM64);
    bigEndian[5] = 2;
    expect(elfMachine(put('text', 'not a binary at all, only text'))).toBeUndefined();
    expect(elfMachine(put('short', Buffer.from([0x7f, 0x45])))).toBeUndefined();
    expect(elfMachine(put('big', bigEndian))).toBeUndefined();
  });

  it('finds the newest glibc version a binary asks for', () => {
    const file = put('g', elf(ARM64, 'GLIBC_2.17\0GLIBC_2.34\0GLIBC_2.9\0GLIBC_PRIVATE\0'));
    expect(highestGlibc(file)).toStrictEqual([2, 34]);
    expect(highestGlibc(put('none', elf(ARM64)))).toBeUndefined();
  });

  it('recognises a WebAssembly module by its header', () => {
    expect(isWasmModule(put('ok.wasm', WASM))).toBe(true);
    expect(isWasmModule(put('lfs.wasm', 'version https://git-lfs.github.com/spec/v1'))).toBe(false);
  });
});

describe('a bundle for linux-arm64', () => {
  it('has no problems when every native file is built for arm64', () => {
    bundle();
    expect(problems()).toStrictEqual([]);
  });

  it('names a native addon built for another architecture', () => {
    bundle();
    put('node_modules/node-pty/prebuilds/linux-x64/pty.node', elf(X64));
    expect(problems()).toStrictEqual([
      'node_modules/node-pty/prebuilds/linux-x64/pty.node is built for x64, not arm64',
    ]);
  });

  it('names a native addon that is not an ELF file', () => {
    bundle();
    put('node_modules/node-pty/prebuilds/win32-x64/pty.node', 'MZ');
    expect(problems()).toStrictEqual([
      'node_modules/node-pty/prebuilds/win32-x64/pty.node is not a little-endian ELF binary',
    ]);
  });

  it('asks for the arm64 build of the voice and Claude native files', () => {
    bundle(X64);
    expect(problems()).toStrictEqual([
      'node_modules/@snazzah/davey-linux-arm64-gnu/davey.linux-arm64-gnu.node is built for x64, not arm64',
      'node_modules/@anthropic-ai/claude-agent-sdk-linux-arm64/claude is built for x64, not arm64',
    ]);
  });

  it('reports the missing Claude binary and the missing arm64 voice addon', () => {
    rmSync(scratch, { recursive: true, force: true });
    mkdirSync(scratch);
    expect(problems()).toStrictEqual(
      expect.arrayContaining([
        'node_modules/@snazzah/davey-linux-arm64-gnu/davey.linux-arm64-gnu.node is missing',
        'node_modules/@anthropic-ai/claude-agent-sdk-linux-arm64/claude is missing',
      ]),
    );
  });

  it('refuses a native addon that needs a newer glibc than the oldest supported system', () => {
    bundle();
    const newer = `GLIBC_${String(OLDEST_SUPPORTED_GLIBC[0])}.${String(OLDEST_SUPPORTED_GLIBC[1] + 1)}`;
    put(
      'node_modules/@snazzah/davey-linux-arm64-gnu/davey.linux-arm64-gnu.node',
      elf(ARM64, newer),
    );
    expect(problems()).toContain(
      `node_modules/@snazzah/davey-linux-arm64-gnu/davey.linux-arm64-gnu.node needs glibc 2.32, newer than 2.31`,
    );
  });

  it('accepts a native addon that needs exactly the oldest supported glibc', () => {
    bundle();
    const exact = `GLIBC_${OLDEST_SUPPORTED_GLIBC.join('.')}`;
    put(
      'node_modules/@snazzah/davey-linux-arm64-gnu/davey.linux-arm64-gnu.node',
      elf(ARM64, exact),
    );
    expect(problems()).toStrictEqual([]);
  });

  it('refuses a native sharp, which the service replaces with WebAssembly', () => {
    bundle();
    put('node_modules/@img/sharp-linux-arm64/lib/sharp.js', 'x');
    put('node_modules/@img/sharp-libvips-linux-arm64/lib/libvips.txt', 'x');
    expect(problems()).toStrictEqual([
      '@img/sharp-libvips-linux-arm64 ships although sharp is bundled as WebAssembly',
      '@img/sharp-linux-arm64 ships although sharp is bundled as WebAssembly',
    ]);
  });

  it('refuses a bundle without the portable sharp', () => {
    bundle();
    rmSync(join(scratch, 'node_modules/@img'), { recursive: true });
    expect(problems()).toStrictEqual(['@img/sharp-wasm32 is missing, so sharp cannot load']);
  });

  it('refuses a WebAssembly file that is not a module', () => {
    bundle();
    put('node_modules/opusscript/build/opusscript_native_wasm.wasm', 'version https://git-lfs');
    expect(problems()).toStrictEqual([
      'node_modules/opusscript/build/opusscript_native_wasm.wasm is not a WebAssembly module',
    ]);
  });

  it('names each wake model file that is missing', () => {
    bundle();
    rmSync(join(scratch, WAKE_MODEL_DIRECTORY, 'tokens.txt'));
    rmSync(join(scratch, WAKE_MODEL_DIRECTORY, 'joiner.int8.onnx'));
    expect(problems()).toStrictEqual([
      `${WAKE_MODEL_DIRECTORY}/joiner.int8.onnx is missing`,
      `${WAKE_MODEL_DIRECTORY}/tokens.txt is missing`,
    ]);
  });
});

describe('the ffmpeg and go2rtc programs of a package', () => {
  it('is not checked before they are staged', () => {
    bundle();
    put('node_modules/ffmpeg-static/ffmpeg', elf(X64));
    expect(problems(false)).toStrictEqual([]);
  });

  it('names the host ffmpeg left in an arm64 package and the missing go2rtc', () => {
    bundle();
    put('node_modules/ffmpeg-static/ffmpeg', elf(X64));
    expect(problems(true)).toStrictEqual([
      'node_modules/ffmpeg-static/ffmpeg is built for x64, not arm64',
      'go2rtc/go2rtc is missing',
    ]);
  });

  it('accepts arm64 programs', () => {
    bundle();
    put('node_modules/ffmpeg-static/ffmpeg', elf(ARM64));
    put('go2rtc/go2rtc', elf(ARM64));
    expect(problems(true)).toStrictEqual([]);
  });
});

describe('verifying a bundle', () => {
  it('fails with every problem named before loading anything', () => {
    expect(() => {
      verifyServiceTarget(scratch, 'linux-arm64', { binaries: true });
    }).toThrow(ServiceTargetError);
    expect(() => {
      verifyServiceTarget(scratch, 'linux-arm64', { binaries: true });
    }).toThrow(/does not fit linux-arm64:\n- .*davey.*is missing[\s\S]*go2rtc\/go2rtc is missing/u);
  });

  it('fails loudly naming the cause when the shipped packages do not load', () => {
    bundle();
    expect(() => {
      smokeLoadedPackages(scratch, ARM64_TARGET);
    }).toThrow(ServiceRuntimeError);
    expect(() => {
      smokeLoadedPackages(scratch, ARM64_TARGET);
    }).toThrow(/The shipped packages did not load \(exit 1\)[\s\S]*sherpa-onnx/u);
  });

  it('knows exactly the targets the Raspberry Pi and the laptop need', () => {
    expect(SERVICE_TARGET_NAME.options).toStrictEqual(['linux-x64', 'linux-arm64']);
  });
});

describe('service assets for a target', () => {
  it('ships only the voice addon of the target architecture', () => {
    copyServiceAssets(scratch, { platform: 'linux', arch: 'arm64' });
    expect(
      existsSync(
        join(scratch, 'node_modules/@snazzah/davey-linux-arm64-gnu/davey.linux-arm64-gnu.node'),
      ),
    ).toBe(true);
    expect(existsSync(join(scratch, 'node_modules/@snazzah/davey-linux-x64-gnu'))).toBe(false);
    expect(existsSync(join(scratch, WAKE_MODEL_DIRECTORY, 'tokens.txt'))).toBe(true);
  });

  it('keeps every installed voice addon when no target is named', () => {
    copyServiceAssets(scratch);
    expect(existsSync(join(scratch, 'node_modules/@snazzah/davey-linux-arm64-gnu'))).toBe(true);
    expect(existsSync(join(scratch, 'node_modules/@snazzah/davey-linux-x64-gnu'))).toBe(true);
  });
});
