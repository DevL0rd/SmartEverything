import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';

const DOWNLOAD = z.strictObject({
  url: z.url().startsWith('https://'),
  sha256: z.string().regex(/^[0-9a-f]{64}$/u),
});

const PER_ARCH = z.strictObject({ x64: DOWNLOAD, arm64: DOWNLOAD });

const BUILD_HOST_PIN = z.strictObject({
  jdkMajor: z.number().int().positive(),
  cmake: z.string().min(1),
  go: z.strictObject({
    version: z.string().regex(/^\d+\.\d+\.\d+$/u),
    x64: DOWNLOAD,
    arm64: DOWNLOAD,
  }),
  jdk: PER_ARCH,
  androidCommandLineTools: DOWNLOAD,
  debian: z.strictObject({ zip: PER_ARCH, unzip: PER_ARCH }),
});

export type BuildHostPin = z.infer<typeof BUILD_HOST_PIN>;

export type PinnedDownload = z.infer<typeof DOWNLOAD>;

export type PinArch = 'x64' | 'arm64';

export function readBuildHostPin(): BuildHostPin {
  return BUILD_HOST_PIN.parse(
    JSON.parse(readFileSync(join(import.meta.dirname, 'build-host-pin.json'), 'utf8')),
  );
}
