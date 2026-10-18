import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { Logger } from '@smarteverything/logging';
import { extraLicences } from './licence-extras.ts';
import { installedPackages, noticeFile, noticesOf } from './licence-notices.ts';
import { productionPackages, readPolicy, REPOSITORY_ROOT } from './licence-policy.ts';
import type { ProductionPackage } from './licence-policy.ts';

const log = new Logger('tool.licenses-list');

const ASSETS = join(REPOSITORY_ROOT, 'apps', 'app', 'assets');
const OUTPUT = join(ASSETS, 'licences.json');
const NOTICES_OUTPUT = join(ASSETS, 'third-party-notices.txt');
const GO2RTC_DIRECTORY = join(REPOSITORY_ROOT, 'tooling', 'go2rtc');

const GO2RTC_PIN = z.object({ version: z.string().min(1) });

function go2rtc(): { readonly entry: ProductionPackage; readonly text: string } {
  const pin = GO2RTC_PIN.parse(
    JSON.parse(readFileSync(join(GO2RTC_DIRECTORY, 'pin.json'), 'utf8')),
  );
  const text = readFileSync(join(GO2RTC_DIRECTORY, 'LICENSE'), 'utf8');
  if (!text.startsWith('MIT License')) {
    throw new Error('The go2rtc LICENSE is no longer MIT; update the licence list by hand.');
  }
  return { entry: { name: 'go2rtc', version: pin.version, licence: 'MIT' }, text: text.trim() };
}

function byName(left: ProductionPackage, right: ProductionPackage): number {
  return left.name.localeCompare(right.name) || left.version.localeCompare(right.version);
}

const policy = readPolicy();
const bundled = go2rtc();
const all = [
  ...productionPackages(policy).filter((one) => !one.name.startsWith('@smarteverything/')),
  bundled.entry,
  ...extraLicences(),
].sort(byName);
writeFileSync(OUTPUT, `${JSON.stringify(all, null, 2)}\n`);

const notices = noticesOf(all, installedPackages()).map((one) =>
  one.name === 'go2rtc' ? { ...one, text: bundled.text } : one,
);
writeFileSync(NOTICES_OUTPUT, noticeFile(notices));
log.info('licenses.listed', {
  count: all.length,
  output: OUTPUT,
  notices: NOTICES_OUTPUT,
  withoutText: notices.filter((one) => one.text === null).length,
});
