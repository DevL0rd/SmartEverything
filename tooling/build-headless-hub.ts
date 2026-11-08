import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { buildService } from './build-service.ts';
import { stageFfmpeg } from './ffmpeg-binary.ts';
import { GO2RTC_RESOURCE_DIRECTORY, stageGo2rtc } from './go2rtc-binary.ts';
import { SERVICE_TARGET_NAME, serviceTarget, verifyServiceTarget } from './service-target.ts';

const root = join(import.meta.dirname, '..');
const go2rtcBuilds = join(root, 'tooling', 'go2rtc', 'out');

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: { target: { type: 'string' }, out: { type: 'string' } },
  });
  const name = SERVICE_TARGET_NAME.parse(values.target);
  const { platform, arch } = serviceTarget(name);
  const out = resolve(values.out ?? join(root, 'tmp', 'headless', 'service'));
  await buildService(out, name);
  await stageGo2rtc(go2rtcBuilds, join(out, GO2RTC_RESOURCE_DIRECTORY), platform, arch);
  await stageFfmpeg(out, platform, arch);
  verifyServiceTarget(out, name, { binaries: true });
}

if (import.meta.main) await main();
