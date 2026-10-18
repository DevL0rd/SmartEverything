import { chmod, copyFile, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';

export const GO2RTC_RESOURCE_DIRECTORY = 'go2rtc';
export const GO2RTC_LICENSE_FILE = 'LICENSE.go2rtc.txt';

const GO2RTC_OS: Readonly<Record<string, string>> = {
  linux: 'linux',
  darwin: 'darwin',
  win32: 'windows',
};

const GO2RTC_ARCH: Readonly<Record<string, string>> = { x64: 'amd64', arm64: 'arm64' };

const SHIPPED = new Set([
  'linux-amd64',
  'linux-arm64',
  'darwin-amd64',
  'darwin-arm64',
  'windows-amd64',
]);

export class Go2rtcTargetError extends Error {
  readonly received: string;

  constructor(received: string) {
    super(`go2rtc is built for ${[...SHIPPED].join(', ')}; received a package for ${received}`);
    this.name = 'Go2rtcTargetError';
    this.received = received;
  }
}

export function go2rtcBuildName(platform: string, arch: string): string {
  const target = `${GO2RTC_OS[platform] ?? platform}-${GO2RTC_ARCH[arch] ?? arch}`;
  if (!SHIPPED.has(target)) {
    throw new Go2rtcTargetError(`${platform}/${arch}`);
  }
  return `go2rtc-${target}${platform === 'win32' ? '.exe' : ''}`;
}

export function go2rtcShippedName(platform: string): string {
  return platform === 'win32' ? 'go2rtc.exe' : 'go2rtc';
}

export async function stageGo2rtc(
  builds: string,
  stage: string,
  platform: string,
  arch: string,
): Promise<void> {
  const source = path.join(builds, go2rtcBuildName(platform, arch));
  await rm(stage, { recursive: true, force: true });
  await mkdir(stage, { recursive: true });
  const binary = path.join(stage, go2rtcShippedName(platform));
  await copyFile(source, binary);
  await chmod(binary, 0o755);
  await copyFile(path.join(builds, GO2RTC_LICENSE_FILE), path.join(stage, GO2RTC_LICENSE_FILE));
}
