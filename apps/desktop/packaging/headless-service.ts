import { execFile } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs, promisify } from 'node:util';
import { stageFfmpeg } from '../src/service/ffmpeg-binary.js';
import { GO2RTC_RESOURCE_DIRECTORY, stageGo2rtc } from '../src/service/go2rtc-binary.js';

const run = promisify(execFile);

const desktop = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repository = path.resolve(desktop, '..', '..');
const tooling = path.join(repository, 'tooling');
const go2rtcBuilds = path.join(tooling, 'go2rtc', 'out');
const MAX_OUTPUT_BYTES = 64 * 1024 * 1024;

class HeadlessTargetError extends Error {
  override readonly name = 'HeadlessTargetError';

  constructor(received: string | undefined) {
    super(`--target must look like linux-arm64; received ${String(received)}`);
  }
}

async function tool(script: string, args: readonly string[]): Promise<void> {
  const { stdout } = await run(
    process.execPath,
    ['--import', 'tsx', path.join(tooling, script), ...args],
    { cwd: repository, maxBuffer: MAX_OUTPUT_BYTES },
  );
  process.stdout.write(stdout);
}

function parseTarget(received: string | undefined): {
  readonly name: string;
  readonly platform: string;
  readonly arch: string;
} {
  const [platform, arch] = received?.split('-') ?? [];
  if (received === undefined || platform === undefined || arch === undefined) {
    throw new HeadlessTargetError(received);
  }
  return { name: received, platform, arch };
}

const { values } = parseArgs({ options: { target: { type: 'string' }, out: { type: 'string' } } });
const target = parseTarget(values.target);
const out = path.resolve(values.out ?? path.join(desktop, 'dist', `headless-${target.name}`));

await tool('build-service.ts', ['--target', target.name, '--out', out]);
await stageGo2rtc(
  go2rtcBuilds,
  path.join(out, GO2RTC_RESOURCE_DIRECTORY),
  target.platform,
  target.arch,
);
await stageFfmpeg(out, target.platform, target.arch);
await tool('service-target.ts', ['--target', target.name, '--binaries', out]);
