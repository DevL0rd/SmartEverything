import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { Logger } from '@smarteverything/logging';

const log = new Logger('tool.licenses-list');

const ROOT = join(import.meta.dirname, '..');
const OUTPUT = join(ROOT, 'apps', 'app', 'assets', 'licences.json');

const REPORT = z.record(
  z.string(),
  z.array(z.object({ name: z.string().min(1), versions: z.array(z.string().min(1)).min(1) })),
);

const GO2RTC_PIN = z.object({ version: z.string().min(1) });

interface Licence {
  readonly name: string;
  readonly version: string;
  readonly licence: string;
}

function packages(): readonly Licence[] {
  const shown = execFileSync('pnpm', ['licenses', 'list', '--prod', '--json'], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  return Object.entries(REPORT.parse(JSON.parse(shown))).flatMap(([licence, listed]) =>
    listed
      .filter((entry) => !entry.name.startsWith('@smarteverything/'))
      .flatMap((entry) =>
        entry.versions.map((version) => ({ name: entry.name, version, licence })),
      ),
  );
}

function go2rtc(): Licence {
  const pin = GO2RTC_PIN.parse(
    JSON.parse(readFileSync(join(ROOT, 'tooling', 'go2rtc', 'pin.json'), 'utf8')),
  );
  const text = readFileSync(join(ROOT, 'tooling', 'go2rtc', 'LICENSE'), 'utf8');
  if (!text.startsWith('MIT License')) {
    throw new Error('The go2rtc LICENSE is no longer MIT; update the licence list by hand.');
  }
  return { name: 'go2rtc', version: pin.version, licence: 'MIT' };
}

const all = [...packages(), go2rtc()].sort(
  (left, right) => left.name.localeCompare(right.name) || left.version.localeCompare(right.version),
);
writeFileSync(OUTPUT, `${JSON.stringify(all, null, 2)}\n`);
log.info('licenses.listed', { count: all.length, output: OUTPUT });
